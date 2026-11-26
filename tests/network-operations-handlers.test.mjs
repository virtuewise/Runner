import test from "node:test";
import assert from "node:assert/strict";
import { createNetworkOperationsHandlers } from "../src/api/network-operations-handlers.ts";

const now="2026-11-26T12:00:00.000Z";
function fixture(principal) {
  const calls=[];
  const handlers=createNetworkOperationsHandlers({
    async authenticate(){return principal;},
    executionRepository:{async transaction(work){return work({
      async loadOfferForUpdate(id){return {id,legId:"leg",missionId:"mission",runnerId:"runner",
        status:"offered",expiresAt:"2026-11-26T12:02:00.000Z",createdAt:now,version:1};},
      async acceptOffer(){calls.push("accepted");return true;},
      async declineOffer(){calls.push("declined");return true;},
      async recordOfferEvent(){},
    });}},
    queries:{
      async getRunnerOfferInbox(input){calls.push(["inbox",input.authenticatedRunnerId]);return [];},
      async getMissionTracking(input){calls.push(["tracking",input.principal.actorId]);return {missionId:input.missionId};},
      async getDispatcherQueue(input){calls.push(["queue",input.principal.actorId,input.limit]);return [];},
    },
    now:()=>now,
  });
  return {handlers,calls};
}
test("Runner offer inbox requires an authenticated Runner",async()=>{
  const {handlers,calls}=fixture({actorId:"runner",role:"runner"});
  const response=await handlers.runnerOffers(new Request("https://runner.test/offers"));
  assert.equal(response.status,200);
  assert.deepEqual(calls[0],["inbox","runner"]);
});
test("non-Runner cannot read the offer inbox",async()=>{
  const {handlers,calls}=fixture({actorId:"requester",role:"requester"});
  const response=await handlers.runnerOffers(new Request("https://runner.test/offers"));
  assert.equal(response.status,403);
  assert.equal(calls.length,0);
});
test("Runner accept command uses authenticated identity, not body identity",async()=>{
  const {handlers,calls}=fixture({actorId:"runner",role:"runner"});
  const response=await handlers.respondToOffer(new Request("https://runner.test/offers/respond",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({offerId:"offer",decision:"accept",runnerId:"attacker"}),
  }));
  assert.equal(response.status,200);
  assert.deepEqual(calls,["accepted"]);
});
test("invalid offer decisions are rejected before persistence",async()=>{
  const {handlers,calls}=fixture({actorId:"runner",role:"runner"});
  const response=await handlers.respondToOffer(new Request("https://runner.test/offers/respond",{
    method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({offerId:"offer",decision:"assign"}),
  }));
  assert.equal(response.status,400);
  assert.equal(calls.length,0);
});
test("dispatcher queue requires a dispatcher or trust operator principal",async()=>{
  const {handlers,calls}=fixture({actorId:"runner",role:"runner"});
  const response=await handlers.dispatcherQueue(new Request("https://runner.test/operations/queue"));
  assert.equal(response.status,403);
  assert.equal(calls.length,0);
});
test("dispatcher queue validates limits and returns server-authorized queue",async()=>{
  const {handlers,calls}=fixture({actorId:"dispatcher",role:"dispatcher"});
  const invalid=await handlers.dispatcherQueue(new Request("https://runner.test/operations/queue?limit=999"));
  assert.equal(invalid.status,400);
  const valid=await handlers.dispatcherQueue(new Request("https://runner.test/operations/queue?limit=25"));
  assert.equal(valid.status,200);
  assert.deepEqual(calls,[["queue","dispatcher",25]]);
});
test("mission tracking uses the authenticated principal",async()=>{
  const {handlers,calls}=fixture({actorId:"requester",role:"requester"});
  const response=await handlers.missionTracking(new Request("https://runner.test/missions/mission"),"mission");
  assert.equal(response.status,200);
  assert.deepEqual(calls,[["tracking","requester"]]);
});
