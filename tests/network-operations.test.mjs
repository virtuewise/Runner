import test from "node:test";
import assert from "node:assert/strict";
import { ingestRunnerLocation, updateRunnerAvailability, validateRunnerLocation } from "../src/domain/mission/network-operations.ts";
const now = "2026-11-26T12:00:00.000Z";
const valid = { latitude: -26.2041, longitude: 28.0473, accuracyMetres: 12, capturedAt: now, sequence: 1 };
test("location validation accepts a fresh, accurate Johannesburg fix", () => {
  assert.equal(validateRunnerLocation(valid, now).ok, true);
});
test("location validation rejects invalid coordinates and poor accuracy", () => {
  assert.deepEqual(validateRunnerLocation({ ...valid, latitude: 91 }, now), { ok: false, reason: "INVALID_LOCATION" });
  assert.deepEqual(validateRunnerLocation({ ...valid, accuracyMetres: 101 }, now), { ok: false, reason: "INVALID_LOCATION" });
});
test("location validation rejects stale and implausibly future timestamps", () => {
  assert.deepEqual(validateRunnerLocation({ ...valid, capturedAt: "2026-11-26T11:54:59.000Z" }, now), { ok: false, reason: "LOCATION_TOO_OLD" });
  assert.deepEqual(validateRunnerLocation({ ...valid, capturedAt: "2026-11-26T12:03:00.000Z" }, now), { ok: false, reason: "LOCATION_FROM_FUTURE" });
});
test("location sequence must be a positive safe integer", () => {
  assert.deepEqual(validateRunnerLocation({ ...valid, sequence: 0 }, now), { ok: false, reason: "INVALID_LOCATION" });
});
test("location ingestion uses the authenticated Runner identity and expiry", async () => {
  let received;
  const result = await ingestRunnerLocation({
    repository: { async recordLocation(input) { received = input; return "recorded"; }, async setAvailability() {} },
    authenticatedRunnerId: "authenticated-runner", location: valid, now,
  });
  assert.equal(result.ok, true);
  assert.equal(received.runnerId, "authenticated-runner");
  assert.equal(received.expiresAt, "2026-11-26T12:05:00.000Z");
});
test("availability rejects invalid or excessive windows", async () => {
  let called = false;
  const repository = { async recordLocation() { return "recorded"; }, async setAvailability() { called = true; } };
  assert.deepEqual(await updateRunnerAvailability({
    repository, authenticatedRunnerId: "runner",
    window: { availableFrom: now, availableUntil: now, status: "available" }, now,
  }), { ok: false, reason: "INVALID_WINDOW" });
  assert.equal(called, false);
});
