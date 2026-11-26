import test from "node:test";
import assert from "node:assert/strict";
import { createRunnerOperationsClient } from "../src/api/runner-operations-client.ts";

function mockSession() {
  const calls = [];
  return {
    calls,
    async get(path) {
      calls.push({ method: "GET", path });
      if (path === "/v1/runner/offers") return { offers: [{ offerId: "offer-1" }] };
      if (path === "/v1/runner/availability") return { windows: [{ id: "window-1" }] };
      if (path === "/v1/runner/location-sharing") return { purpose: "active_mission", enabled: false };
      if (path.startsWith("/v1/operations/dispatch-queue")) return { queue: [{ missionId: "mission-1" }] };
      if (path.startsWith("/v1/operations/incidents")) return { incidents: [{ incidentId: "incident-1" }] };
      if (path.includes("/tracking")) return { mission: { missionId: "mission/with spaces" } };
      throw new Error("Unexpected GET " + path);
    },
    async post(path, body) {
      calls.push({ method: "POST", path, body });
      return path === "/v1/runner/location-sharing"
        ? { purpose: "active_mission", enabled: body.enabled }
        : {};
    },
  };
}

test("Runner operations client uses authenticated API routes and unwraps read models", async () => {
  const session = mockSession();
  const client = createRunnerOperationsClient(session);
  assert.equal((await client.getOffers())[0].offerId, "offer-1");
  assert.equal((await client.getAvailability())[0].id, "window-1");
  assert.equal((await client.getLocationSharing()).enabled, false);
  assert.equal((await client.getDispatcherQueue(25))[0].missionId, "mission-1");
  assert.equal((await client.getIncidentQueue(10))[0].incidentId, "incident-1");
  assert.equal((await client.getMissionTracking("mission/with spaces")).missionId, "mission/with spaces");
  assert.ok(session.calls.some(call => call.path === "/v1/missions/mission%2Fwith%20spaces/tracking"));
  assert.ok(session.calls.some(call => call.path === "/v1/operations/dispatch-queue?limit=25"));
});

test("Runner operations client sends offer decisions and availability without client identity", async () => {
  const session = mockSession();
  const client = createRunnerOperationsClient(session);
  await client.respondToOffer("offer-1", "accept");
  await client.setAvailability({
    availableFrom: "2026-11-27T08:00:00.000Z",
    availableUntil: "2026-11-27T17:00:00.000Z",
    status: "available",
  });
  assert.deepEqual(session.calls[0], {
    method: "POST", path: "/v1/runner/offers/respond",
    body: { offerId: "offer-1", decision: "accept" },
  });
  assert.equal("runnerId" in session.calls[1].body, false);
  assert.equal((await client.setLocationSharing(true)).enabled, true);
});

test("Runner operations client rejects malformed identifiers, windows and limits before network calls", async () => {
  const session = mockSession();
  const client = createRunnerOperationsClient(session);
  await assert.rejects(() => client.respondToOffer("", "accept"), /Invalid offer ID/);
  await assert.rejects(() => client.getMissionTracking(""), /Invalid mission ID/);
  await assert.rejects(() => client.getDispatcherQueue(0), /Limit must be/);
  await assert.rejects(() => client.setAvailability({
    availableFrom: "2026-11-27T17:00:00.000Z",
    availableUntil: "2026-11-27T08:00:00.000Z",
    status: "available",
  }), /valid, increasing time window/);
  assert.equal(session.calls.length, 0);
});
