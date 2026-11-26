import test from "node:test";
import assert from "node:assert/strict";
import { processOutboxBatch } from "../src/domain/mission/outbox-worker.ts";
import { productionCustodyCrypto } from "../src/domain/mission/production-custody-crypto.ts";

function storeFixture(attempts=1){
  const calls=[];
  return {calls,store:{
    async claimBatch(){return [{id:"msg-1",aggregateId:"mission-1",eventType:"test.event",payload:{safe:true},attempts}];},
    async markPublished(x){calls.push(["published",x]);},
    async scheduleRetry(x){calls.push(["retry",x]);},
    async moveToDeadLetter(x){calls.push(["dead",x]);}
  }};
}
const policy={batchSize:10,leaseSeconds:30,maxAttempts:3,baseBackoffSeconds:5,maxBackoffSeconds:60};
test("outbox worker publishes and marks successful messages",async()=>{
  const f=storeFixture();
  const result=await processOutboxBatch({store:f.store,publisher:{async publish(){}},policy,now:"2026-11-26T10:00:00.000Z"});
  assert.deepEqual(result,{claimed:1,published:1,retried:0,deadLettered:0});
  assert.equal(f.calls[0][0],"published");
});
test("outbox worker schedules bounded exponential retry",async()=>{
  const f=storeFixture(2);
  const result=await processOutboxBatch({store:f.store,publisher:{async publish(){throw new Error("secret provider detail");}},
    policy,now:"2026-11-26T10:00:00.000Z"});
  assert.deepEqual(result,{claimed:1,published:0,retried:1,deadLettered:0});
  assert.equal(f.calls[0][0],"retry");
  assert.equal(f.calls[0][1].availableAt,"2026-11-26T10:00:10.000Z");
  assert.equal(f.calls[0][1].errorCode,"publisher_failed");
});
test("outbox worker dead-letters after the configured attempt budget",async()=>{
  const f=storeFixture(3);
  const result=await processOutboxBatch({store:f.store,publisher:{async publish(){throw new Error("provider down");}},
    policy,now:"2026-11-26T10:00:00.000Z"});
  assert.deepEqual(result,{claimed:1,published:0,retried:0,deadLettered:1});
  assert.equal(f.calls[0][0],"dead");
});
test("production custody crypto creates high-entropy tokens and SHA-256 digests",async()=>{
  const token=productionCustodyCrypto.randomToken(32);
  assert.match(token,/^[a-f0-9]{64}$/);
  const digest=await productionCustodyCrypto.hashToken(token);
  assert.match(digest,/^[a-f0-9]{64}$/);
  assert.equal(productionCustodyCrypto.equalDigest(digest,digest),true);
  assert.equal(productionCustodyCrypto.equalDigest(digest,"0".repeat(64)),false);
  assert.equal(productionCustodyCrypto.equalDigest(digest,"short"),false);
});
