import test from "node:test";
import assert from "node:assert/strict";
import { createMission, attachQuote, publishMission, assignRunner, transitionMission, calculateQuote, canTransition } from "../src/domain/mission/index.ts";

const terms = {
  category: "parcel", description: "Sealed document pouch", declaredValueMinor: 0, weightGrams: 300,
  pickup: { countryCode: "ZA", locality: "Johannesburg", addressLine: "10 Main Road" },
  destination: { countryCode: "ZA", locality: "Sandton", addressLine: "20 Market Street" },
  requiredCapabilities: ["document-handling"], prohibitedItemScreeningPassed: true,
};
const ctx = (actorId, n, actorRole = "requester") => ({ actorId, actorRole, occurredAt: `2026-11-24T10:0${n}:00.000Z`, eventId: `evt-${n}`, idempotencyKey: `key-${n}` });
const quote = { base:{amountMinor:5000,currency:"ZAR"}, distance:{amountMinor:1200,currency:"ZAR"},
  handling:{amountMinor:0,currency:"ZAR"}, platformFee:{amountMinor:620,currency:"ZAR"},
  runnerReward:{amountMinor:5580,currency:"ZAR"}, requesterTotal:{amountMinor:6820,currency:"ZAR"},
  expiresAt:"2026-11-24T11:00:00.000Z", pricingVersion:"za-v1" };
const runner = { runnerId:"runner-1", identityVerified:true, qualified:true, active:true,
  capabilities:["document-handling"], jurisdictionCodes:["ZA"] };
function openMission() {
  const created = createMission({id:"mission-1",requesterId:"requester-1",terms,context:ctx("requester-1",0)});
  assert.equal(created.ok,true);
  const quoted = attachQuote(created.value,quote,ctx("requester-1",1),0);
  assert.equal(quoted.ok,true);
  return publishMission(quoted.value,ctx("requester-1",2),1);
}

test("mission requires requester ownership and valid declared terms", () => {
  assert.equal(createMission({id:"m",requesterId:"r",terms,context:ctx("intruder",0)}).error.code,"FORBIDDEN");
  assert.equal(createMission({id:"m",requesterId:"r",terms:{...terms,prohibitedItemScreeningPassed:false},context:ctx("r",0)}).error.code,"INVALID_INPUT");
});

test("mission follows draft -> quoted -> open with sequenced audit events", () => {
  const result = openMission();
  assert.equal(result.ok,true);
  assert.equal(result.value.status,"open");
  assert.deepEqual(result.events.map(e=>e.sequence),[3]);
  assert.equal(result.events[0].type,"mission.opened");
});

test("expired quotes and stale versions are rejected", () => {
  const created = createMission({id:"m",requesterId:"r",terms,context:ctx("r",0)});
  const expired = attachQuote(created.value,{...quote,expiresAt:"2026-11-24T09:00:00.000Z"},ctx("r",1),0);
  assert.equal(expired.error.code,"INVALID_INPUT");
  assert.equal(publishMission(created.value,ctx("r",2),99).error.code,"VERSION_CONFLICT");
});

test("assignment requires qualified, verified, active Runner and jurisdiction", () => {
  const opened = openMission().value;
  assert.equal(assignRunner(opened,{...runner,identityVerified:false},ctx("dispatch-1",3,"dispatcher"),2).error.code,"INELIGIBLE_RUNNER");
  assert.equal(assignRunner(opened,{...runner,jurisdictionCodes:["US"]},ctx("dispatch-1",3,"dispatcher"),2).error.code,"INELIGIBLE_RUNNER");
  const assigned = assignRunner(opened,runner,ctx("dispatch-1",3,"dispatcher"),2);
  assert.equal(assigned.ok,true);
  assert.equal(assigned.value.assignedRunnerId,"runner-1");
});

test("only assigned Runner can advance custody lifecycle", () => {
  const assigned = assignRunner(openMission().value,runner,ctx("dispatch-1",3,"dispatcher"),2).value;
  assert.equal(transitionMission(assigned,"runner_en_route",ctx("other",4,"runner"),3).error.code,"FORBIDDEN");
  const enRoute = transitionMission(assigned,"runner_en_route",ctx("runner-1",4,"runner"),3);
  assert.equal(enRoute.ok,true);
  assert.equal(transitionMission(enRoute.value,"delivered",ctx("runner-1",5,"runner"),4).error.code,"INVALID_TRANSITION");
});

test("pricing is deterministic, currency-explicit and rejects invalid input", () => {
  const result = calculateQuote({terms,estimatedDistanceMetres:2500,now:"2026-11-24T10:00:00.000Z",
    policy:{version:"za-v1",currency:"ZAR",baseMinor:5000,perKilometreMinor:400,
      handlingMinor:0,platformFeeBasisPoints:1000,runnerShareBasisPoints:9000,quoteValidityMinutes:30}});
  assert.equal(result.distance.amountMinor,1000);
  assert.equal(result.requesterTotal.amountMinor,6600);
  assert.throws(()=>calculateQuote({terms,estimatedDistanceMetres:-1,now:"2026-11-24T10:00:00.000Z",
    policy:{version:"v1",currency:"ZAR",baseMinor:1,perKilometreMinor:1,handlingMinor:0,
      platformFeeBasisPoints:0,runnerShareBasisPoints:10000,quoteValidityMinutes:10}}));
});

test("lifecycle policy has no transitions out of closed terminal state", () => {
  assert.equal(canTransition("closed","open"),false);
  assert.equal(canTransition("open","assigned"),true);
});
