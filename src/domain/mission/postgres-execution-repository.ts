import type { DispatchLeg, DispatchOffer, DispatchRunner } from "./dispatch.ts";
import type { CustodyChallenge } from "./custody.ts";
import type { ExecutionRepository, ExecutionTransaction } from "./execution-persistence.ts";
import type { OutboxMessage, OutboxStore } from "./outbox-worker.ts";

interface QueryResult<Row> { readonly rows: readonly Row[]; readonly rowCount: number | null; }
interface PgQueryable { query<Row = Record<string, unknown>>(sql: string, values?: readonly unknown[]): Promise<QueryResult<Row>>; }
interface PgClient extends PgQueryable { release(): void; }
export interface ExecutionPgPool extends PgQueryable { connect(): Promise<PgClient>; }
interface LegRow {
  id:string; mission_id:string; leg_number:number; status:DispatchLeg["status"];
  origin_country:string; destination_country:string; required_capabilities:string[];
  required_vehicle_class:string|null; service_window_start:Date|string; service_window_end:Date|string; sequence_version:number;
}
interface RunnerRow {
  runner_id:string; identity_status:string; qualification_status:string; is_active:boolean;
  capabilities:string[]; jurisdictions:string[]; vehicle_class:string|null;
  available_from:Date|string; available_until:Date|string; active_leg_count:number; capacity:number;
}
interface OfferRow {
  id:string; leg_id:string; mission_id:string; runner_id:string; status:DispatchOffer["status"];
  expires_at:Date|string; created_at:Date|string; version:number; dispatcher_id:string|null; idempotency_key:string|null;
}
interface CustodyRow {
  challenge_id:string; mission_id:string; from_leg_id:string|null; to_leg_id:string|null;
  releasing_actor_id:string; receiving_actor_id:string; token_hash_hex:string; purpose:string;
  expires_at:Date|string; status:string; release_confirmed_at:Date|string|null;
  receive_confirmed_at:Date|string|null; version:number; invalidated_at:Date|string|null;
}
const iso=(value:Date|string)=>value instanceof Date?value.toISOString():new Date(value).toISOString();
function offerFromRow(row:OfferRow):DispatchOffer {
  return {id:row.id,legId:row.leg_id,missionId:row.mission_id,runnerId:row.runner_id,status:row.status,
    expiresAt:iso(row.expires_at),createdAt:iso(row.created_at),version:Number(row.version),
    ...(row.dispatcher_id?{dispatcherId:row.dispatcher_id}:{}),...(row.idempotency_key?{idempotencyKey:row.idempotency_key}:{})};
}
function custodyFromRow(row:CustodyRow):CustodyChallenge {
  return {id:row.challenge_id,missionId:row.mission_id,legId:row.from_leg_id??row.to_leg_id??"",
    releasingActorId:row.releasing_actor_id,receivingActorId:row.receiving_actor_id,
    purpose:row.purpose as CustodyChallenge["purpose"],tokenHash:row.token_hash_hex,
    expiresAt:iso(row.expires_at),status:row.invalidated_at?"invalidated":
      row.status==="confirmed"?"confirmed":row.status==="expired"?"expired":row.status==="disputed"?"disputed":"pending",
    ...(row.release_confirmed_at?{releaseConfirmedAt:iso(row.release_confirmed_at)}:{}),
    ...(row.receive_confirmed_at?{receiveConfirmedAt:iso(row.receive_confirmed_at)}:{}),version:Number(row.version)};
}

class PostgresExecutionTransaction implements ExecutionTransaction {
  private readonly client:PgClient;
  private currentLeg:DispatchLeg|null=null;
  private currentNow:string="";
  constructor(client:PgClient){this.client=client;}

  async findOfferByIdempotencyKey(dispatcherId:string,key:string):Promise<DispatchOffer|null>{
    const q=await this.client.query<OfferRow>(`select * from public.dispatch_offers where dispatcher_id=$1 and idempotency_key=$2`,[dispatcherId,key]);
    return q.rows[0]?offerFromRow(q.rows[0]):null;
  }
  async lockNextOpenLeg(input:{now:string;zone?:string}):Promise<DispatchLeg|null>{
    const q=await this.client.query<LegRow>(`select l.id,l.mission_id,l.leg_number,l.status,
      coalesce(l.origin->>'countryCode','') as origin_country,
      coalesce(l.destination->>'countryCode','') as destination_country,
      array(select jsonb_array_elements_text(coalesce(m.manifest->'requiredCapabilities','[]'::jsonb))) as required_capabilities,
      coalesce(m.manifest->>'requiredVehicleClass',null) as required_vehicle_class,
      l.service_window_start,l.service_window_end,l.sequence_version
      from public.mission_legs l join public.missions m on m.id=l.mission_id
      where l.status='open' and m.status in ('open','matching')
        and l.service_window_start <= $1::timestamptz
        and l.service_window_end >= $1::timestamptz
      order by l.service_window_start,l.created_at
      for update of l skip locked limit 1`,[input.now]);
    const row=q.rows[0]; if(!row)return null;
    const leg:DispatchLeg={id:row.id,missionId:row.mission_id,legNumber:Number(row.leg_number),status:row.status,
      originCountry:row.origin_country,destinationCountry:row.destination_country,
      requiredCapabilities:row.required_capabilities??[],...(row.required_vehicle_class?{requiredVehicleClass:row.required_vehicle_class}:{}),
      serviceWindowStart:iso(row.service_window_start),serviceWindowEnd:iso(row.service_window_end),version:Number(row.sequence_version)};
    this.currentLeg=leg; this.currentNow=input.now; return leg;
  }
  async findCandidates(leg:DispatchLeg,limit:number):Promise<readonly string[]>{
    const q=await this.client.query<{runner_id:string}>(`select rp.runner_id from public.runner_profiles rp
      where rp.identity_status='verified' and rp.qualification_status='qualified' and rp.is_active
      and rp.max_active_legs > (select count(*) from public.mission_legs active
        where active.assigned_runner_id=rp.runner_id and active.status not in ('delivered','cancelled','failed'))
      and exists(select 1 from public.runner_availability_windows aw where aw.runner_id=rp.runner_id
        and aw.status='available' and aw.available_from <= $2 and aw.available_until >= $3)
      and not exists(select 1 from unnest($4::text[]) required(code)
        where not exists(select 1 from public.runner_capabilities rc where rc.runner_id=rp.runner_id
          and rc.capability_code=required.code and rc.status='verified' and (rc.valid_until is null or rc.valid_until>$1::timestamptz)))
      and exists(select 1 from public.runner_jurisdictions rj where rj.runner_id=rp.runner_id
        and rj.country_code=$5 and rj.status='approved')
      and exists(select 1 from public.runner_jurisdictions rj where rj.runner_id=rp.runner_id
        and rj.country_code=$6 and rj.status='approved')
      and ($7::text is null or rp.vehicle_class=$7)
      order by (select count(*) from public.mission_legs active where active.assigned_runner_id=rp.runner_id
        and active.status not in ('delivered','cancelled','failed')),rp.created_at
      limit $8`,[this.currentNow,leg.serviceWindowStart,leg.serviceWindowEnd,leg.requiredCapabilities,
        leg.originCountry,leg.destinationCountry,leg.requiredVehicleClass??null,limit]);
    return q.rows.map(x=>x.runner_id);
  }
  async loadRunner(runnerId:string):Promise<DispatchRunner|null>{
    if(!this.currentLeg)return null;
    const q=await this.client.query<RunnerRow>(`select rp.runner_id,rp.identity_status,rp.qualification_status,rp.is_active,
      rp.vehicle_class,rp.max_active_legs as capacity,
      coalesce((select array_agg(rc.capability_code) from public.runner_capabilities rc where rc.runner_id=rp.runner_id
        and rc.status='verified' and (rc.valid_until is null or rc.valid_until>$4::timestamptz)),'{}') as capabilities,
      coalesce((select array_agg(rj.country_code) from public.runner_jurisdictions rj where rj.runner_id=rp.runner_id
        and rj.status='approved'),'{}') as jurisdictions,
      aw.available_from,aw.available_until,
      (select count(*) from public.mission_legs active where active.assigned_runner_id=rp.runner_id
        and active.status not in ('delivered','cancelled','failed')) +
      (select count(*) from public.dispatch_offers pending where pending.runner_id=rp.runner_id and pending.status='offered'
        and pending.expires_at>$4::timestamptz) as active_leg_count
      from public.runner_profiles rp join public.runner_availability_windows aw on aw.runner_id=rp.runner_id
      where rp.runner_id=$1 and aw.status='available' and aw.available_from <= $2 and aw.available_until >= $3
      order by aw.available_from limit 1`,[runnerId,this.currentLeg.serviceWindowStart,this.currentLeg.serviceWindowEnd,this.currentNow]);
    const row=q.rows[0];if(!row)return null;
    return {runnerId:row.runner_id,identityVerified:row.identity_status==="verified",qualified:row.qualification_status==="qualified",
      active:row.is_active,capabilities:row.capabilities??[],approvedJurisdictions:row.jurisdictions??[],
      ...(row.vehicle_class?{vehicleClass:row.vehicle_class}:{}),availableFrom:iso(row.available_from),
      availableUntil:iso(row.available_until),activeLegCount:Number(row.active_leg_count),capacity:Number(row.capacity)};
  }
  async createOffer(offer:DispatchOffer):Promise<void>{
    await this.client.query(`insert into public.dispatch_offers
      (id,mission_id,leg_id,runner_id,status,expires_at,created_at,version,dispatcher_id,idempotency_key)
      values($1,$2,$3,$4,'offered',$5,$6,$7,$8,$9)`,
      [offer.id,offer.missionId,offer.legId,offer.runnerId,offer.expiresAt,offer.createdAt,offer.version,
        offer.dispatcherId,offer.idempotencyKey]);
  }
  async appendEvent(input:{missionId:string;legId:string;type:"dispatch.offer_created"|"dispatch.offer_rejected";
    actorId:string;reason:string;occurredAt:string;idempotencyKey:string}):Promise<void>{
    await this.insertMissionEvent({missionId:input.missionId,actorId:input.actorId,actorRole:"dispatcher",
      type:input.type,occurredAt:input.occurredAt,idempotencyKey:input.idempotencyKey,
      metadata:{legId:input.legId,reason:input.reason}});
  }
  async enqueueOutbox(input:{eventId:string;aggregateId:string;eventType:string;payload:Readonly<Record<string,string>>}):Promise<void>{
    await this.client.query(`insert into public.transactional_outbox(id,aggregate_id,event_type,payload)
      values($1,$2,$3,$4::jsonb)`,[input.eventId,input.aggregateId,input.eventType,JSON.stringify(input.payload)]);
  }
  async loadOfferForUpdate(id:string):Promise<DispatchOffer|null>{
    const q=await this.client.query<OfferRow>(`select * from public.dispatch_offers where id=$1 for update`,[id]);
    return q.rows[0]?offerFromRow(q.rows[0]):null;
  }
  async acceptOffer(input:{offerId:string;runnerId:string;now:string;expectedVersion:number}):Promise<boolean>{
    const q=await this.client.query(`update public.dispatch_offers set status='accepted',responded_at=$1,version=version+1
      where id=$2 and runner_id=$3 and status='offered' and expires_at>$1 and version=$4 returning leg_id`,
      [input.now,input.offerId,input.runnerId,input.expectedVersion]);
    if(!q.rows.length)return false;
    const leg=await this.client.query(`update public.mission_legs set status='assigned',assigned_runner_id=$1,
      sequence_version=sequence_version+1,updated_at=$2 where id=$3 and status='open' returning id`,
      [input.runnerId,input.now,(q.rows[0] as {leg_id:string}).leg_id]);
    if(!leg.rows.length)throw new Error("Dispatch leg is no longer assignable");
    return true;
  }
  async declineOffer(input:{offerId:string;runnerId:string;now:string;expectedVersion:number}):Promise<boolean>{
    const q=await this.client.query(`update public.dispatch_offers set status='declined',responded_at=$1,version=version+1
      where id=$2 and runner_id=$3 and status='offered' and expires_at>$1 and version=$4 returning id`,
      [input.now,input.offerId,input.runnerId,input.expectedVersion]);return q.rows.length===1;
  }
  async expireOffers(now:string,limit:number):Promise<readonly DispatchOffer[]>{
    const q=await this.client.query<OfferRow>(`with expired as (
      select id from public.dispatch_offers where status='offered' and expires_at<=$1
      order by expires_at for update skip locked limit $2
    ) update public.dispatch_offers o set status='expired',responded_at=$1,version=version+1
      from expired where o.id=expired.id returning o.*`,[now,limit]);
    return q.rows.map(offerFromRow);
  }
  async invalidateOffersForLeg(input:{legId:string;now:string;reason:string}):Promise<number>{
    const q=await this.client.query(`update public.dispatch_offers set status='revoked',responded_at=$2,version=version+1
      where leg_id=$1 and status in ('offered','accepted')`,[input.legId,input.now]);
    await this.client.query(`update public.mission_legs set assigned_runner_id=null,status='open',
      sequence_version=sequence_version+1,updated_at=$2 where id=$1 and status='assigned'`,[input.legId,input.now]);
    return q.rowCount??0;
  }
  async invalidateCustodyForLeg(input:{legId:string;now:string}):Promise<number>{
    const q=await this.client.query(`update public.custody_handovers set status='rejected',invalidated_at=$2,version=version+1
      where (from_leg_id=$1 or to_leg_id=$1) and status='initiated' and invalidated_at is null`,[input.legId,input.now]);
    return q.rowCount??0;
  }
  async recordOfferEvent(input:{offer:DispatchOffer;actorId:string;actorRole:"runner"|"dispatcher"|"system";
    eventType:string;reason:string;occurredAt:string;idempotencyKey:string}):Promise<void>{
    await this.insertMissionEvent({missionId:input.offer.missionId,actorId:input.actorId,actorRole:input.actorRole,
      type:input.eventType,occurredAt:input.occurredAt,idempotencyKey:input.idempotencyKey,
      metadata:{legId:input.offer.legId,offerId:input.offer.id,runnerId:input.offer.runnerId,reason:input.reason}});
    await this.client.query(`insert into public.transactional_outbox(id,aggregate_id,event_type,payload)
      values(gen_random_uuid(),$1,$2,$3::jsonb) on conflict(aggregate_id,event_type) do nothing`,
      [input.offer.id,input.eventType,JSON.stringify({offerId:input.offer.id,legId:input.offer.legId,runnerId:input.offer.runnerId})]);
  }
  private async insertMissionEvent(input:{missionId:string;actorId:string;actorRole:string;type:string;occurredAt:string;
    idempotencyKey:string;metadata:Record<string,string>}):Promise<void>{
    await this.client.query(`insert into public.mission_events(event_id,mission_id,sequence,actor_id,actor_role,event_type,
      idempotency_key,from_status,to_status,payload,occurred_at)
      select gen_random_uuid(),m.id,(select coalesce(max(e.sequence),0)+1 from public.mission_events e where e.mission_id=m.id),
        $2,$3,$4,$5,m.status,m.status,$6::jsonb,$7 from public.missions m where m.id=$1
      on conflict(mission_id,actor_id,idempotency_key) do nothing`,
      [input.missionId,input.actorId,input.actorRole,input.type,input.idempotencyKey,JSON.stringify(input.metadata),input.occurredAt]);
  }

  async createChallenge(challenge:CustodyChallenge):Promise<void>{
    await this.client.query(`insert into public.custody_handovers
      (id,mission_id,from_leg_id,to_leg_id,releasing_actor_id,receiving_actor_id,token_hash,evidence_type,status,
       challenge_id,purpose,expires_at,version,evidence_metadata)
      values($1,$2,$3,null,$4,$5,decode($6,'hex'),'dual_confirmation','initiated',$1,$7,$8,$9,'{}'::jsonb)`,
      [challenge.id,challenge.missionId,challenge.legId,challenge.releasingActorId,challenge.receivingActorId,
        challenge.tokenHash,challenge.purpose,challenge.expiresAt,challenge.version]);
  }
  async loadChallengeForUpdate(id:string):Promise<CustodyChallenge|null>{
    const q=await this.client.query<CustodyRow>(`select challenge_id,mission_id,from_leg_id,to_leg_id,releasing_actor_id,
      receiving_actor_id,encode(token_hash,'hex') as token_hash_hex,purpose,expires_at,status,release_confirmed_at,
      receive_confirmed_at,version,invalidated_at from public.custody_handovers where challenge_id=$1 for update`,[id]);
    return q.rows[0]?custodyFromRow(q.rows[0]):null;
  }
  async saveChallenge(challenge:CustodyChallenge,expectedVersion:number):Promise<boolean>{
    const q=await this.client.query(`update public.custody_handovers set status=$1,release_confirmed_at=$2,
      receive_confirmed_at=$3,version=$4,invalidated_at=$5
      where challenge_id=$6 and version=$7 and status='initiated' and invalidated_at is null`,
      [challenge.status==="confirmed"?"confirmed":challenge.status==="expired"?"expired":
        challenge.status==="disputed"?"disputed":challenge.status==="invalidated"?"rejected":"initiated",
        challenge.releaseConfirmedAt??null,challenge.receiveConfirmedAt??null,challenge.version,
        challenge.status==="invalidated"?new Date().toISOString():null,challenge.id,expectedVersion]);
    return q.rowCount===1;
  }
  async appendCustodyEvent(input:{challengeId:string;missionId:string;legId:string;actorId:string;
    type:"custody.challenge_issued"|"custody.release_confirmed"|"custody.receive_confirmed"|"custody.handover_confirmed"|"custody.challenge_invalidated";
    occurredAt:string}):Promise<void>{
    await this.insertMissionEvent({missionId:input.missionId,actorId:input.actorId,
      actorRole:"runner",type:input.type,occurredAt:input.occurredAt,idempotencyKey:input.type+":"+input.challengeId,
      metadata:{challengeId:input.challengeId,legId:input.legId}});
  }
}

export function createPostgresExecutionRepository(pool:ExecutionPgPool):ExecutionRepository{
  return {async transaction<T>(work:(tx:ExecutionTransaction)=>Promise<T>):Promise<T>{
    const client=await pool.connect();
    try{await client.query("begin");const result=await work(new PostgresExecutionTransaction(client));await client.query("commit");return result;}
    catch(error){try{await client.query("rollback");}catch{/* retain root error */}throw error;}
    finally{client.release();}
  }};
}

export function createPostgresOutboxStore(pool:ExecutionPgPool):OutboxStore{
  return {
    async claimBatch(input){
      const client=await pool.connect();
      try{await client.query("begin");
        const q=await client.query<{id:string;aggregate_id:string;event_type:string;payload:Record<string,unknown>;attempts:number}>(
          `with claimed as (select id from public.transactional_outbox
            where published_at is null and dead_lettered_at is null and available_at<=$1
              and (lease_until is null or lease_until<=$1)
            order by available_at,created_at for update skip locked limit $2)
           update public.transactional_outbox o set lease_until=$1::timestamptz+($3::text||' seconds')::interval,
             attempts=o.attempts+1 from claimed where o.id=claimed.id returning o.id,o.aggregate_id,o.event_type,o.payload,o.attempts`,
          [input.now,input.limit,input.leaseSeconds]);
        await client.query("commit");
        return q.rows.map(row=>({id:row.id,aggregateId:row.aggregate_id,eventType:row.event_type,payload:row.payload,attempts:Number(row.attempts)}));
      }catch(error){try{await client.query("rollback");}catch{}throw error;}finally{client.release();}
    },
    async markPublished(input){await pool.query(`update public.transactional_outbox set published_at=$2,lease_until=null
      where id=$1 and published_at is null`,[input.id,input.publishedAt]);},
    async scheduleRetry(input){await pool.query(`update public.transactional_outbox set available_at=$2,last_error_code=$3,
      lease_until=null where id=$1 and published_at is null and dead_lettered_at is null`,[input.id,input.availableAt,input.errorCode]);},
    async moveToDeadLetter(input){await pool.query(`update public.transactional_outbox set dead_lettered_at=$2,
      last_error_code=$3,lease_until=null where id=$1 and published_at is null`,[input.id,input.failedAt,input.errorCode]);},
  };
}
