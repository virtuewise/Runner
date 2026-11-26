export interface RunnerLocationInput {
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracyMetres: number;
  readonly headingDegrees?: number;
  readonly speedMetresPerSecond?: number;
  readonly capturedAt: string;
  readonly sequence: number;
}
export interface RunnerLocationSnapshot extends RunnerLocationInput {
  readonly runnerId: string;
  readonly receivedAt: string;
  readonly expiresAt: string;
}
export interface RunnerAvailabilityInput {
  readonly availableFrom: string;
  readonly availableUntil: string;
  readonly status: "available" | "unavailable";
}
export interface NetworkOperationsRepository {
  recordLocation(input: { runnerId: string; location: RunnerLocationInput; receivedAt: string; expiresAt: string }): Promise<"recorded" | "stale" | "sharing_disabled">;
  getLocationSharing(runnerId: string): Promise<boolean>;
  setLocationSharing(input: { runnerId: string; enabled: boolean; updatedAt: string }): Promise<void>;
  setAvailability(input: { runnerId: string; window: RunnerAvailabilityInput; recordedAt: string }): Promise<void>;
}
export type LocationResult =
  | { readonly ok: true; readonly value: { readonly status: "recorded" | "stale" | "sharing_disabled" } }
  | { readonly ok: false; readonly reason: "INVALID_LOCATION" | "LOCATION_TOO_OLD" | "LOCATION_FROM_FUTURE" };
const MAX_LOCATION_AGE_MS = 5 * 60_000;
const MAX_FUTURE_SKEW_MS = 2 * 60_000;
const MAX_ACCURACY_METRES = 100;
const MAX_SPEED_METRES_PER_SECOND = 100;
const isFiniteNumber = (value: number): boolean => Number.isFinite(value);
export function validateRunnerLocation(input: RunnerLocationInput, now: string): LocationResult {
  const captured = Date.parse(input.capturedAt);
  const current = Date.parse(now);
  if (!Number.isFinite(captured) || !Number.isFinite(current) ||
      !isFiniteNumber(input.latitude) || input.latitude < -90 || input.latitude > 90 ||
      !isFiniteNumber(input.longitude) || input.longitude < -180 || input.longitude > 180 ||
      !isFiniteNumber(input.accuracyMetres) || input.accuracyMetres <= 0 ||
      input.accuracyMetres > MAX_ACCURACY_METRES ||
      !Number.isSafeInteger(input.sequence) || input.sequence < 1 ||
      (input.headingDegrees !== undefined && (!isFiniteNumber(input.headingDegrees) || input.headingDegrees < 0 || input.headingDegrees >= 360)) ||
      (input.speedMetresPerSecond !== undefined && (!isFiniteNumber(input.speedMetresPerSecond) || input.speedMetresPerSecond < 0 || input.speedMetresPerSecond > MAX_SPEED_METRES_PER_SECOND))) {
    return { ok: false, reason: "INVALID_LOCATION" };
  }
  if (captured > current + MAX_FUTURE_SKEW_MS) return { ok: false, reason: "LOCATION_FROM_FUTURE" };
  if (current - captured > MAX_LOCATION_AGE_MS) return { ok: false, reason: "LOCATION_TOO_OLD" };
  return { ok: true, value: { status: "recorded" } };
}
export async function ingestRunnerLocation(input: {
  repository: NetworkOperationsRepository;
  authenticatedRunnerId: string;
  location: RunnerLocationInput;
  now: string;
}): Promise<LocationResult> {
  const validation = validateRunnerLocation(input.location, input.now);
  if (!validation.ok) return validation;
  const receivedAt = new Date(input.now).toISOString();
  const result = await input.repository.recordLocation({
    runnerId: input.authenticatedRunnerId,
    location: input.location,
    receivedAt,
    expiresAt: new Date(Date.parse(receivedAt) + MAX_LOCATION_AGE_MS).toISOString(),
  });
  return { ok: true, value: { status: result } };
}
export async function setRunnerLocationSharing(input: {
  repository: NetworkOperationsRepository;
  authenticatedRunnerId: string;
  enabled: boolean;
  now: string;
}): Promise<void> {
  if (!Number.isFinite(Date.parse(input.now))) throw new Error("Invalid timestamp");
  await input.repository.setLocationSharing({
    runnerId: input.authenticatedRunnerId,
    enabled: input.enabled,
    updatedAt: new Date(input.now).toISOString(),
  });
}
export async function updateRunnerAvailability(input: {
  repository: NetworkOperationsRepository;
  authenticatedRunnerId: string;
  window: RunnerAvailabilityInput;
  now: string;
}): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: "INVALID_WINDOW" }> {
  const start = Date.parse(input.window.availableFrom);
  const end = Date.parse(input.window.availableUntil);
  const now = Date.parse(input.now);
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(now) ||
      (input.window.status !== "available" && input.window.status !== "unavailable") ||
      end <= start || start < now - 60_000 || end - start > 31 * 24 * 60 * 60_000) {
    return { ok: false, reason: "INVALID_WINDOW" };
  }
  await input.repository.setAvailability({
    runnerId: input.authenticatedRunnerId,
    window: input.window,
    recordedAt: new Date(now).toISOString(),
  });
  return { ok: true };
}
