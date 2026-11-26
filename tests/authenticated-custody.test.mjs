import test from "node:test";
import assert from "node:assert/strict";
import { createBearerAuthenticator } from "../src/api/bearer-authentication.ts";
import { createCustodyHandlers } from "../src/api/custody-handlers.ts";

const now = "2026-11-26T10:00:00.000Z";
const token = "a".repeat(64);
const crypto = {
  randomToken: () => token,
  async hashToken(value) { return value === token ? "b".repeat(64) : "c".repeat(64); },
  equalDigest(left, right) { return left === right; },
};

test("bearer authenticator requires a verified, correctly scoped and unexpired token", async () => {
  const claims = { sub:"runner-1", iss:"https://identity.runner.test", aud:["runner-api"],
    exp: Math.floor(Date.parse(now)/1000)+60, role:"runner" };
  const authenticate = createBearerAuthenticator({ async verify(value) {
    assert.equal(value, "signed.token.value"); return claims;
  }}, { issuer:"https://identity.runner.test", audience:"runner-api",
    nowSeconds:()=>Math.floor(Date.parse(now)/1000) });
  assert.equal(await authenticate(new Request("https://api.test",{headers:{authorization:"Bearer signed.token.value"}})),
    null); // deliberately too-short bearer token is rejected before verification
  const longToken = "x".repeat(20);
  const valid = createBearerAuthenticator({ async verify(){return claims;} }, {
    issuer:"https://identity.runner.test", audience:"runner-api",
    nowSeconds:()=>Math.floor(Date.parse(now)/1000) });
  assert.deepEqual(await valid(new Request("https://api.test",{headers:{authorization:"Bearer "+longToken}})),
    {actorId:"runner-1",role:"runner"});
  claims.exp = Math.floor(Date.parse(now)/1000)-120;
  assert.equal(await valid(new Request("https://api.test",{headers:{authorization:"Bearer "+longToken}})),null);
});

function custodyFixture() {
  const state = { challenge:null, events:[] };
  const repository = { async transaction(work) {
    return work({
      async createChallenge(challenge) { state.challenge = challenge; },
      async loadChallengeForUpdate(id) { return state.challenge?.id === id ? state.challenge : null; },
      async saveChallenge(challenge, expectedVersion) {
        if (!state.challenge || state.challenge.version !== expectedVersion) return false;
        state.challenge = challenge; return true;
      },
      async expireChallenges() { return []; },
      async appendCustodyEvent(event) { state.events.push(event); },
    });
  }};
  const authenticate = async request => request.headers.get("x-actor") === "receiver"
    ? {actorId:"runner-receiver",role:"runner"}
    : {actorId:"runner-releaser",role:"runner"};
  const handlers = createCustodyHandlers({
    authenticate, repository, crypto,
    authorization:{ async authorizeIssue(input) {
      if (input.principal.actorId !== "runner-releaser") return null;
      return {missionId:input.missionId,legId:input.legId,
        ...(input.receivingLegId?{receivingLegId:input.receivingLegId}:{}),
        releasingActorId:"runner-releaser",receivingActorId:"runner-receiver",purpose:input.purpose};
    }},
    now:()=>now, createId:()=>"challenge-1",
  });
  return {handlers,state};
}

test("custody challenge is issued only after authoritative participant authorization", async () => {
  const {handlers,state}=custodyFixture();
  const denied=await handlers.issue(new Request("https://api.test/custody",{
    method:"POST",headers:{"content-type":"application/json","x-actor":"receiver"},
    body:JSON.stringify({missionId:"m1",legId:"l1",purpose:"pickup"}),
  }));
  assert.equal(denied.status,403);
  assert.equal(state.challenge,null);
  const issued=await handlers.issue(new Request("https://api.test/custody",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({missionId:"m1",legId:"l1",purpose:"pickup"}),
  }));
  assert.equal(issued.status,201);
  const payload=await issued.json();
  assert.equal(payload.token,token);
  assert.equal(payload.challenge.tokenHash,"[redacted]");
  assert.equal(state.challenge.tokenHash,"b".repeat(64));
});

test("custody confirmation is bound to authenticated releasing and receiving parties", async () => {
  const {handlers,state}=custodyFixture();
  await handlers.issue(new Request("https://api.test/custody",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({missionId:"m1",legId:"l1",purpose:"pickup"}),
  }));
  const release=await handlers.confirm(new Request("https://api.test/custody/challenge-1/confirm",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({token}),
  }),"challenge-1");
  assert.equal(release.status,200);
  assert.equal(state.challenge.status,"pending");
  const receive=await handlers.confirm(new Request("https://api.test/custody/challenge-1/confirm",{
    method:"POST",headers:{"content-type":"application/json","x-actor":"receiver"},
    body:JSON.stringify({token}),
  }),"challenge-1");
  assert.equal(receive.status,200);
  assert.equal(state.challenge.status,"confirmed");
  assert.equal(state.events.at(-1).type,"custody.handover_confirmed");
});
