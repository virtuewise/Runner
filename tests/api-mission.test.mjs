import test from "node:test";
import assert from "node:assert/strict";
import { createMissionApi } from "../src/api/mission-api.ts";

const requester = { actorId: "11111111-1111-4111-8111-111111111111", role: "requester" };
const validTerms = {
  category: "parcel",
  description: "Small sealed parcel",
  currency: "ZAR",
  declaredValueMinor: 25000,
  weightGrams: 850,
  pickup: { countryCode: "ZA", locality: "Johannesburg", addressLine: "1 Main Road" },
  destination: { countryCode: "ZA", locality: "Sandton", addressLine: "2 Market Street" },
  requiredCapabilities: [],
};
function fixture() {
  const missions = new Map();
  const receipts = new Map();
  const events = [];
  const tx = {
    async insertMission(mission) { missions.set(mission.id, mission); },
    async loadMissionForUpdate(id) { return missions.get(id) ?? null; },
    async loadRunnerEligibility() { return null; },
    async saveMission(mission, expected) {
      const current = missions.get(mission.id);
      if (!current || current.version !== expected) return false;
      missions.set(mission.id, mission);
      return true;
    },
    async appendEvents(items) { events.push(...items); },
    async claimIdempotency(input) {
      const key = [input.actorId, input.scope, input.key].join(":");
      const existing = receipts.get(key);
      if (existing) return existing.hash === input.requestHash
        ? (existing.body ? { kind: "replay", responseStatus: existing.status, responseBody: existing.body } : { kind: "conflict" })
        : { kind: "conflict" };
      receipts.set(key, { hash: input.requestHash, body: null, status: null });
      return { kind: "claimed" };
    },
    async completeIdempotency(input) {
      const key = [input.actorId, input.scope, input.key].join(":");
      const receipt = receipts.get(key);
      receipt.status = input.responseStatus;
      receipt.body = input.responseBody;
    },
  };
  const repository = { unitOfWork: { async run(work) { return work(tx); } } };
  let id = 0;
  const api = createMissionApi({
    repository,
    authenticate: async () => requester,
    pricingPolicy: () => ({
      version: "test-v1", currency: "ZAR", baseMinor: 2500, perKilometreMinor: 100,
      handlingMinor: 500, platformFeeBasisPoints: 1000, runnerShareBasisPoints: 7000,
      quoteValidityMinutes: 15,
    }),
    estimateDistanceMetres: async () => 12000,
    screenManifest: async () => true,
    pricingServiceActorId: "22222222-2222-4222-8222-222222222222",
    now: () => "2026-11-26T00:00:00.000Z",
    newId: () => `33333333-3333-4333-8333-${String(++id).padStart(12, "0")}`,
  });
  return { api, missions, events };
}
function post(url, body, key = "mission-create-key-0001", extra = {}) {
  return new Request(`https://runner.test${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": key, ...extra },
    body: JSON.stringify(body),
  });
}

test("mission API rejects unauthenticated requests", async () => {
  const { api } = fixture();
  const unauthenticated = createMissionApi({
    repository: { unitOfWork: { run: async () => { throw new Error("must not run"); } } },
    authenticate: async () => null,
    pricingPolicy: () => { throw new Error("unused"); },
    estimateDistanceMetres: async () => 0,
    screenManifest: async () => true,
    pricingServiceActorId: "22222222-2222-4222-8222-222222222222",
  });
  const response = await unauthenticated(new Request("https://runner.test/v1/missions", { method: "POST" }));
  assert.equal(response.status, 401);
});

test("mission API creates a draft using server-derived requester identity", async () => {
  const { api, missions, events } = fixture();
  const response = await api(post("/v1/missions", { terms: validTerms }));
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.equal(body.data.requesterId, requester.actorId);
  assert.equal(body.data.status, "draft");
  assert.equal(missions.size, 1);
  assert.equal(events.length, 1);
  assert.equal(response.headers.get("etag"), '"1"');
});

test("mission API replays an identical idempotent create request", async () => {
  const { api, missions, events } = fixture();
  const payload = { terms: validTerms };
  const first = await api(post("/v1/missions", payload));
  const second = await api(post("/v1/missions", payload));
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.deepEqual(await second.json(), await first.json());
  assert.equal(missions.size, 1);
  assert.equal(events.length, 1);
});

test("mission API refuses manifests rejected by server-side screening", async () => {
  const { api: unused, ...fixtureState } = fixture();
  const repository = { unitOfWork: { run: async () => { throw new Error("screening must stop before persistence"); } } };
  const api = createMissionApi({
    repository,
    authenticate: async () => requester,
    pricingPolicy: () => { throw new Error("unused"); },
    estimateDistanceMetres: async () => 0,
    screenManifest: async () => false,
    pricingServiceActorId: "22222222-2222-4222-8222-222222222222",
  });
  const response = await api(post("/v1/missions", { terms: validTerms }));
  assert.equal(response.status, 422);
});
