import test from "node:test";
import assert from "node:assert/strict";
import { createDispatchOffer } from "../src/domain/mission/dispatch.ts";
import { confirmCustody, issueCustodyChallenge } from "../src/domain/mission/custody.ts";

function dispatchFixture(override = {}) {
  const events=[], outbox=[], offers=[];
  const leg={id:"leg-1",missionId:"mission-1",legNumber:1,status:"open",originCountry:"ZA",destinationCountry:"ZA",
    requiredCapabilities:["sealed_parcel"],requiredVehicleClass:"car",serviceWindowStart:"2026-11-26T10:00:00.000Z",
    serviceWindowEnd:"2026-11-26T12:00:00.000Z",version:1};
  const runner={runnerId:"runner-1",identityVerified:true,qualified:true,active:true,capabilities:["sealed_parcel"],
    vehicleClass:"car",approvedJurisdictions:["ZA"],availableFrom:"2026-11-26T09:00:00.000Z",
    availableUntil:"2026-11-26T13:00:00.000Z",activeLegCount:0,capacity:1,...override};
  const repository={async transaction(work){return work({
    async lockDispatchIdempotency(){},async findOfferByIdempotencyKey(){return null;},async lockNextOpenLeg(){return leg;},async findCandidates(){return [runner.runnerId];},async loadRunner(){return runner;},
    async createOffer(o){offers.push(o);},async appendEvent(e){events.push(e);},async enqueueOutbox(e){outbox.push(e);}
  });}};
  return {repository,events,outbox,offers};
}
test("dispatch revalidates Runner and atomically records offer, event and outbox",async()=>{
  const f=dispatchFixture();
  const result=await createDispatchOffer({repository:f.repository,policy:{offerTtlSeconds:60,maxCandidates:5},
    now:"2026-11-26T10:00:00.000Z",offerId:"offer-1",eventId:"event-1",dispatcherId:"dispatcher-1",idempotencyKey:"key-1"});
  assert.equal(result.ok,true);assert.equal(f.offers.length,1);
  assert.equal(f.events[0].type,"dispatch.offer_created");assert.equal(f.outbox[0].eventType,"dispatch.offer_created");
  assert.equal(result.offer.status,"offered");
});
test("dispatch rejects a Runner who fails current jurisdiction or capacity checks",async()=>{
  const f=dispatchFixture({approvedJurisdictions:[],activeLegCount:1});
  const result=await createDispatchOffer({repository:f.repository,policy:{offerTtlSeconds:60,maxCandidates:5},
    now:"2026-11-26T10:00:00.000Z",offerId:"offer-1",eventId:"event-1",dispatcherId:"dispatcher-1",idempotencyKey:"key-1"});
  assert.deepEqual(result,{ok:false,reason:"NO_ELIGIBLE_RUNNER"});assert.equal(f.offers.length,0);
  assert.equal(f.events[0].reason,"runner_revalidation_failed");
});
function custodyFixture(){
  const records=new Map(),events=[];
  const repository={async transaction(work){return work({
    async createChallenge(c){records.set(c.id,c);},async loadChallengeForUpdate(id){return records.get(id)??null;},
    async saveChallenge(c,expected){const old=records.get(c.id);if(!old||old.version!==expected)return false;records.set(c.id,c);return true;},
    async appendCustodyEvent(e){events.push(e);}
  });}};
  let seq=0;
  const crypto={randomToken(){seq++;return "a".repeat(63)+String(seq);},
    async hashToken(t){let h=0;for(const c of t)h=(h*31+c.charCodeAt(0))>>>0;return h.toString(16).padStart(64,"0");},
    equalDigest(a,b){return a===b;}};
  return {repository,crypto,records,events};
}
test("custody completes only after both authenticated parties confirm",async()=>{
  const f=custodyFixture();
  const issued=await issueCustodyChallenge({repository:f.repository,crypto:f.crypto,challengeId:"c1",missionId:"m1",legId:"l1",
    releasingActorId:"sender",receivingActorId:"receiver",purpose:"relay_handover",now:"2026-11-26T10:00:00.000Z",ttlSeconds:120});
  assert.equal(issued.ok,true);assert.equal(issued.challenge.tokenHash,"[redacted]");
  const token=issued.plaintextToken;
  const first=await confirmCustody({repository:f.repository,crypto:f.crypto,challengeId:"c1",actorId:"sender",token,now:"2026-11-26T10:00:10.000Z"});
  assert.equal(first.ok,true);assert.equal(first.challenge.status,"pending");
  const second=await confirmCustody({repository:f.repository,crypto:f.crypto,challengeId:"c1",actorId:"receiver",token,now:"2026-11-26T10:00:20.000Z"});
  assert.equal(second.ok,true);assert.equal(second.challenge.status,"confirmed");
  assert.equal(f.events.at(-1).type,"custody.handover_confirmed");
});
test("custody rejects unrelated actors, invalid tokens and replay",async()=>{
  const f=custodyFixture();
  const issued=await issueCustodyChallenge({repository:f.repository,crypto:f.crypto,challengeId:"c2",missionId:"m1",legId:"l1",
    releasingActorId:"sender",receivingActorId:"receiver",purpose:"pickup",now:"2026-11-26T10:00:00.000Z",ttlSeconds:120});
  const token=issued.plaintextToken;
  const wrongActor=await confirmCustody({repository:f.repository,crypto:f.crypto,challengeId:"c2",actorId:"intruder",token,now:"2026-11-26T10:00:10.000Z"});
  assert.deepEqual(wrongActor,{ok:false,reason:"FORBIDDEN"});
  const wrongToken=await confirmCustody({repository:f.repository,crypto:f.crypto,challengeId:"c2",actorId:"sender",token:"wrong-token",now:"2026-11-26T10:00:10.000Z"});
  assert.deepEqual(wrongToken,{ok:false,reason:"INVALID_TOKEN"});
  await confirmCustody({repository:f.repository,crypto:f.crypto,challengeId:"c2",actorId:"sender",token,now:"2026-11-26T10:00:10.000Z"});
  const replay=await confirmCustody({repository:f.repository,crypto:f.crypto,challengeId:"c2",actorId:"sender",token,now:"2026-11-26T10:00:11.000Z"});
  assert.deepEqual(replay,{ok:false,reason:"REPLAYED"});
});
test("custody rejects expired challenges",async()=>{
  const f=custodyFixture();
  const issued=await issueCustodyChallenge({repository:f.repository,crypto:f.crypto,challengeId:"c3",missionId:"m1",legId:"l1",
    releasingActorId:"sender",receivingActorId:"receiver",purpose:"final_delivery",now:"2026-11-26T10:00:00.000Z",ttlSeconds:30});
  const expired=await confirmCustody({repository:f.repository,crypto:f.crypto,challengeId:"c3",actorId:"sender",
    token:issued.plaintextToken,now:"2026-11-26T10:01:00.000Z"});
  assert.deepEqual(expired,{ok:false,reason:"EXPIRED"});
});
