import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createDispatchOffer } from "../src/domain/mission/dispatch.ts";
import { acceptDispatchOffer, declineDispatchOffer, reassignDispatchLeg } from "../src/domain/mission/dispatch-lifecycle.ts";
import { issueCustodyChallenge, confirmCustody, expireCustodyChallenges } from "../src/domain/mission/custody.ts";
import { productionCustodyCrypto } from "../src/domain/mission/production-custody-crypto.ts";
import { createPostgresExecutionRepository, createPostgresDispatchRepository, createPostgresCustodyRepository, createPostgresOutboxStore } from "../src/domain/mission/postgres-execution-repository.ts";
import { processOutboxBatch } from "../src/domain/mission/outbox-worker.ts";

const databaseUrl=process.env.DATABASE_URL;
test("PostgreSQL execution integration: migrations, concurrent dispatch, offer lifecycle, custody and outbox",
  {skip:!databaseUrl},async(t)=>{
    const {Pool}=await import("pg");
    const pool=new Pool({connectionString:databaseUrl,max:12});
    const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
    try {
      for(const file of ["202611250001_mission_persistence.sql","202611260001_dispatch_custody.sql","202611260002_execution_infrastructure.sql"])
        await pool.query(await readFile(resolve(root,"database/migrations",file),"utf8"));

      const requester=randomUUID(),dispatcher=randomUUID(),runner=randomUUID(),runnerTwo=randomUUID(),mission=randomUUID();
      const legOne=randomUUID(),legTwo=randomUUID();
      const now=new Date(),start=new Date(now.getTime()-60_000),end=new Date(now.getTime()+3_600_000);
      const stamp=now.toISOString();
      await pool.query(`insert into public.runner_profiles(runner_id,identity_status,qualification_status,is_active,
        vehicle_class,max_active_legs) values($1,'verified','qualified',true,'car',1)`,[runner]);
      await pool.query(`insert into public.runner_capabilities(runner_id,capability_code,status) values($1,'sealed_parcel','verified')`,[runner]);
      await pool.query(`insert into public.runner_jurisdictions(runner_id,country_code,status) values($1,'ZA','approved')`,[runner]);
      await pool.query(`insert into public.runner_availability_windows(runner_id,available_from,available_until,status)
        values($1,$2,$3,'available')`,[runner,start.toISOString(),end.toISOString()]);
      await pool.query(`insert into public.runner_profiles(runner_id,identity_status,qualification_status,is_active,
        vehicle_class,max_active_legs) values($1,'verified','pending',false,'car',1)`,[runnerTwo]);
      await pool.query(`insert into public.runner_capabilities(runner_id,capability_code,status) values($1,'sealed_parcel','verified')`,[runnerTwo]);
      await pool.query(`insert into public.runner_jurisdictions(runner_id,country_code,status) values($1,'ZA','approved')`,[runnerTwo]);
      await pool.query(`insert into public.runner_availability_windows(runner_id,available_from,available_until,status)
        values($1,$2,$3,'available')`,[runnerTwo,start.toISOString(),end.toISOString()]);
      await pool.query(`insert into public.missions(id,requester_id,status,category,manifest,pickup,destination,
        declared_value_minor,currency,version) values($1,$2,'open','parcel',$3::jsonb,$4::jsonb,$5::jsonb,1000,'ZAR',0)`,
        [mission,requester,JSON.stringify({description:"sealed parcel",weightGrams:500,requiredCapabilities:["sealed_parcel"],
          requiredVehicleClass:"car",prohibitedItemScreeningPassed:true}),
          JSON.stringify({countryCode:"ZA",locality:"Johannesburg",addressLine:"Origin"}),
          JSON.stringify({countryCode:"ZA",locality:"Johannesburg",addressLine:"Destination"})]);
      for(const [id,n] of [[legOne,1],[legTwo,2]]) await pool.query(`insert into public.mission_legs
        (id,mission_id,leg_number,mode,status,origin,destination,jurisdiction_codes,service_window_start,service_window_end)
        values($1,$2,$3,'car','open',$4::jsonb,$5::jsonb,array['ZA'],$6,$7)`,
        [id,mission,n,JSON.stringify({countryCode:"ZA"}),JSON.stringify({countryCode:"ZA"}),start.toISOString(),end.toISOString()]);


      const execution=createPostgresExecutionRepository(pool);
      const dispatch=createPostgresDispatchRepository(pool);
      const custody=createPostgresCustodyRepository(pool);
      const base={repository:dispatch,policy:{offerTtlSeconds:120,maxCandidates:10},now:stamp,dispatcherId:dispatcher};
      const attempts=await Promise.all([
        createDispatchOffer({...base,offerId:randomUUID(),eventId:randomUUID(),idempotencyKey:"dispatch-worker-a"}),
        createDispatchOffer({...base,offerId:randomUUID(),eventId:randomUUID(),idempotencyKey:"dispatch-worker-b"}),
      ]);
      assert.equal(attempts.filter(x=>x.ok).length,1,"capacity and row locks must prevent concurrent over-dispatch");
      assert.equal(attempts.filter(x=>!x.ok&&x.reason==="NO_ELIGIBLE_RUNNER").length,1);
      const winning=attempts.find(x=>x.ok).offer;
      const replay=await createDispatchOffer({...base,offerId:randomUUID(),eventId:randomUUID(),idempotencyKey:winning.idempotencyKey});
      assert.equal(replay.ok,true);
      assert.equal(replay.offer.id,winning.id,"same dispatcher idempotency key returns the original offer");

      const wrongActor=await acceptDispatchOffer({repository:execution,offerId:winning.id,authenticatedRunnerId:requester,now:stamp});
      assert.deepEqual(wrongActor,{ok:false,reason:"FORBIDDEN"});
      const accepted=await acceptDispatchOffer({repository:execution,offerId:winning.id,authenticatedRunnerId:runner,now:stamp});
      assert.equal(accepted.ok,true);
      assert.equal(accepted.offer.status,"accepted");
      const acceptedReplay=await acceptDispatchOffer({repository:execution,offerId:winning.id,authenticatedRunnerId:runner,now:stamp});
      assert.equal(acceptedReplay.ok,true);
      assert.equal(acceptedReplay.replayed,true);
      const declined=await declineDispatchOffer({repository:execution,offerId:winning.id,authenticatedRunnerId:runner,now:stamp});
      assert.deepEqual(declined,{ok:false,reason:"NOT_PENDING"});

      const invalidatedChallenge=await issueCustodyChallenge({repository:custody,crypto:productionCustodyCrypto,
        challengeId:randomUUID(),missionId:mission,legId:winning.legId,releasingActorId:runner,
        receivingActorId:requester,purpose:"final_delivery",now:stamp,ttlSeconds:120});
      assert.equal(invalidatedChallenge.ok,true);
      const reassignment=await reassignDispatchLeg({repository:execution,legId:winning.legId,now:stamp,
        actorId:dispatcher,actorRole:"dispatcher",reason:"operational reassignment test",idempotencyKey:"reassign-001"});
      assert.equal(reassignment.offersRevoked,1);
      assert.equal(reassignment.challengesInvalidated,1);
      const invalidRow=await pool.query("select status,invalidated_at from public.custody_handovers where challenge_id=$1",
        [invalidatedChallenge.challenge.id]);
      assert.equal(invalidRow.rows[0].status,"rejected");
      assert.ok(invalidRow.rows[0].invalidated_at);

      const duplicateKey="same-concurrent-command";
      const duplicateAttempts=await Promise.all([
        createDispatchOffer({...base,offerId:randomUUID(),eventId:randomUUID(),idempotencyKey:duplicateKey}),
        createDispatchOffer({...base,offerId:randomUUID(),eventId:randomUUID(),idempotencyKey:duplicateKey}),
      ]);
      assert.equal(duplicateAttempts.filter(x=>x.ok).length,2);
      assert.equal(duplicateAttempts[0].offer.id,duplicateAttempts[1].offer.id,
        "parallel retries with one idempotency key must resolve to one persisted offer");

      const duplicateOffer=duplicateAttempts[0].offer;
      const duplicateAccepted=await acceptDispatchOffer({repository:execution,offerId:duplicateOffer.id,
        authenticatedRunnerId:runner,now:stamp});
      assert.equal(duplicateAccepted.ok,true);
      const reassignmentReplay=await reassignDispatchLeg({repository:execution,legId:winning.legId,now:stamp,
        actorId:dispatcher,actorRole:"dispatcher",reason:"operational reassignment test",idempotencyKey:"reassign-001"});
      assert.deepEqual(reassignmentReplay,{offersRevoked:0,challengesInvalidated:0});
      const stillAccepted=await pool.query("select status from public.dispatch_offers where id=$1",[duplicateOffer.id]);
      assert.equal(stillAccepted.rows[0].status,"accepted","replayed reassignment must not revoke later work");

      await pool.query("update public.runner_profiles set qualification_status='qualified',is_active=true where runner_id=$1",[runnerTwo]);
      await pool.query("update public.mission_legs set status='assigned',assigned_runner_id=$1 where id=$2",[runnerTwo,legTwo]);
      const relayChallenge=await issueCustodyChallenge({repository:custody,crypto:productionCustodyCrypto,
        challengeId:randomUUID(),missionId:mission,legId:legOne,receivingLegId:legTwo,releasingActorId:runner,
        receivingActorId:runnerTwo,purpose:"relay_handover",now:stamp,ttlSeconds:120});
      assert.equal(relayChallenge.ok,true);
      const relayRelease=await confirmCustody({repository:custody,crypto:productionCustodyCrypto,
        challengeId:relayChallenge.challenge.id,actorId:runner,token:relayChallenge.plaintextToken,now:stamp});
      const relayReceive=await confirmCustody({repository:custody,crypto:productionCustodyCrypto,
        challengeId:relayChallenge.challenge.id,actorId:runnerTwo,token:relayChallenge.plaintextToken,now:stamp});
      assert.equal(relayRelease.ok,true);
      assert.equal(relayReceive.ok,true);
      assert.equal(relayReceive.challenge.status,"confirmed");

      const challenge=await issueCustodyChallenge({repository:custody,crypto:productionCustodyCrypto,
        challengeId:randomUUID(),missionId:mission,legId:winning.legId,releasingActorId:runner,
        receivingActorId:requester,purpose:"final_delivery",now:stamp,ttlSeconds:120});
      assert.equal(challenge.ok,true);
      const token=challenge.plaintextToken;
      const [releaseA,releaseB]=await Promise.all([
        confirmCustody({repository:custody,crypto:productionCustodyCrypto,challengeId:challenge.challenge.id,
          actorId:runner,token,now:stamp}),
        confirmCustody({repository:custody,crypto:productionCustodyCrypto,challengeId:challenge.challenge.id,
          actorId:runner,token,now:stamp}),
      ]);
      assert.equal([releaseA,releaseB].filter(x=>x.ok).length,1,"concurrent same-party confirmation must be single-use");
      const receive=await confirmCustody({repository:custody,crypto:productionCustodyCrypto,
        challengeId:challenge.challenge.id,actorId:requester,token,now:stamp});
      assert.equal(receive.ok,true);
      assert.equal(receive.challenge.status,"confirmed");

      const expiring=await issueCustodyChallenge({repository:custody,crypto:productionCustodyCrypto,
        challengeId:randomUUID(),missionId:mission,legId:winning.legId,releasingActorId:runner,
        receivingActorId:requester,purpose:"final_delivery",now:stamp,ttlSeconds:30});
      assert.equal(expiring.ok,true);
      const expiredCount=await expireCustodyChallenges({repository:custody,
        now:new Date(Date.parse(stamp)+31_000).toISOString(),batchSize:10});
      assert.equal(expiredCount,1);
      const expiredRow=await pool.query("select status from public.custody_handovers where challenge_id=$1",[expiring.challenge.id]);
      assert.equal(expiredRow.rows[0].status,"expired");

      const outbox=createPostgresOutboxStore(pool);
      const sent=[];
      const deliveryNow=new Date(Date.now()+1000).toISOString();
      const batch=await processOutboxBatch({store:outbox,publisher:{async publish(message){sent.push(message.id);}},
        policy:{batchSize:50,leaseSeconds:30,maxAttempts:3,baseBackoffSeconds:2,maxBackoffSeconds:60},now:deliveryNow});
      assert.ok(batch.published>=1);
      assert.ok(sent.length>=1);
      const deadId=randomUUID();
      await pool.query(`insert into public.transactional_outbox(id,aggregate_id,event_type,payload)
        values($1,$2,'test.deadletter',$3::jsonb)`,[deadId,mission,JSON.stringify({test:true})]);
      const dead=await processOutboxBatch({store:outbox,publisher:{async publish(){throw new Error("provider unavailable");}},
        policy:{batchSize:10,leaseSeconds:30,maxAttempts:1,baseBackoffSeconds:1,maxBackoffSeconds:10},
        now:new Date(Date.now()+2000).toISOString()});
      assert.equal(dead.deadLettered,1);
      const deadRow=await pool.query("select dead_lettered_at from public.transactional_outbox where id=$1",[deadId]);
      assert.ok(deadRow.rows[0].dead_lettered_at);

      const crashId=randomUUID();
      await pool.query(`insert into public.transactional_outbox(id,aggregate_id,event_type,payload)
        values($1,$2,'test.worker_crash',$3::jsonb)`,[crashId,mission,JSON.stringify({test:"lease recovery"})]);
      const firstLease=await outbox.claimBatch({now:deliveryNow,limit:1,leaseSeconds:5});
      assert.equal(firstLease[0].id,crashId);
      const recoveredLease=await outbox.claimBatch({now:new Date(Date.parse(deliveryNow)+6000).toISOString(),limit:1,leaseSeconds:5});
      assert.equal(recoveredLease[0].id,crashId,"expired worker lease must make an unacknowledged message claimable");
      assert.equal(recoveredLease[0].attempts,2);
      await outbox.markPublished({id:crashId,publishedAt:new Date(Date.parse(deliveryNow)+6000).toISOString()});

      const rollbackId=randomUUID();
      await assert.rejects(execution.transaction(async tx=>{
        await tx.createOffer({id:rollbackId,missionId:mission,legId:legTwo,runnerId:runner,status:"offered",
          expiresAt:new Date(Date.now()+60_000).toISOString(),createdAt:new Date().toISOString(),version:1,
          dispatcherId:dispatcher,idempotencyKey:"rollback-test"});
        throw new Error("force rollback");
      }),/force rollback/);
      const rollbackRow=await pool.query("select id from public.dispatch_offers where id=$1",[rollbackId]);
      assert.equal(rollbackRow.rows.length,0,"business writes must roll back together");
    } finally { await pool.end(); }
  });
