import type { MissionId } from "./types.ts";

export interface DispatchLeg {
  readonly id: string; readonly missionId: MissionId; readonly legNumber: number;
  readonly status: "open" | "assigned" | "cancelled" | "failed" | "safety_hold" | "customs_hold";
  readonly originCountry: string; readonly destinationCountry: string;
  readonly requiredCapabilities: readonly string[]; readonly requiredVehicleClass?: string;
  readonly serviceWindowStart: string; readonly serviceWindowEnd: string; readonly version: number;
}
export interface DispatchRunner {
  readonly runnerId: string; readonly identityVerified: boolean; readonly qualified: boolean; readonly active: boolean;
  readonly capabilities: readonly string[]; readonly vehicleClass?: string; readonly approvedJurisdictions: readonly string[];
  readonly availableFrom: string; readonly availableUntil: string; readonly activeLegCount: number; readonly capacity: number;
}
export interface DispatchOffer {
  readonly id: string; readonly legId: string; readonly missionId: string; readonly runnerId: string;
  readonly status: "offered" | "accepted" | "declined" | "expired" | "revoked";
  readonly expiresAt: string; readonly createdAt: string; readonly version: number;
}
export interface DispatchTransaction {
  lockNextOpenLeg(input: { readonly now: string; readonly zone?: string }): Promise<DispatchLeg | null>;
  loadRunner(runnerId: string): Promise<DispatchRunner | null>;
  findCandidates(leg: DispatchLeg, limit: number): Promise<readonly string[]>;
  createOffer(offer: DispatchOffer): Promise<void>;
  appendEvent(input: { readonly missionId: string; readonly legId: string;
    readonly type: "dispatch.offer_created" | "dispatch.offer_rejected"; readonly actorId: string;
    readonly reason: string; readonly occurredAt: string; readonly idempotencyKey: string }): Promise<void>;
  enqueueOutbox(input: { readonly eventId: string; readonly aggregateId: string; readonly eventType: string;
    readonly payload: Readonly<Record<string, string>> }): Promise<void>;
}
export interface DispatchRepository { transaction<T>(work: (tx: DispatchTransaction) => Promise<T>): Promise<T>; }
export interface DispatchPolicy { readonly offerTtlSeconds: number; readonly maxCandidates: number; readonly zone?: string; }
export type DispatchResult = { readonly ok: true; readonly offer: DispatchOffer } |
  { readonly ok: false; readonly reason: "NO_OPEN_LEG" | "NO_ELIGIBLE_RUNNER" };

function eligible(leg: DispatchLeg, runner: DispatchRunner, now: number): boolean {
  return runner.identityVerified && runner.qualified && runner.active && runner.activeLegCount < runner.capacity &&
    leg.requiredCapabilities.every((capability) => runner.capabilities.includes(capability)) &&
    (!leg.requiredVehicleClass || leg.requiredVehicleClass === runner.vehicleClass) &&
    [leg.originCountry, leg.destinationCountry].every((country) => runner.approvedJurisdictions.includes(country)) &&
    Date.parse(runner.availableFrom) <= Date.parse(leg.serviceWindowStart) &&
    Date.parse(runner.availableUntil) >= Date.parse(leg.serviceWindowEnd) && now <= Date.parse(leg.serviceWindowEnd);
}

/** Creates a time-limited offer, never an assignment. Acceptance is a separate authenticated command. */
export async function createDispatchOffer(input: {
  readonly repository: DispatchRepository; readonly policy: DispatchPolicy; readonly now: string;
  readonly offerId: string; readonly eventId: string; readonly dispatcherId: string; readonly idempotencyKey: string;
}): Promise<DispatchResult> {
  const now = Date.parse(input.now);
  if (!Number.isFinite(now) || !input.offerId || !input.eventId || !input.dispatcherId || !input.idempotencyKey ||
      !Number.isSafeInteger(input.policy.offerTtlSeconds) || input.policy.offerTtlSeconds < 15 ||
      input.policy.offerTtlSeconds > 3600 || !Number.isSafeInteger(input.policy.maxCandidates) ||
      input.policy.maxCandidates < 1 || input.policy.maxCandidates > 100) throw new Error("Invalid dispatch command or policy");
  return input.repository.transaction(async (tx) => {
    const leg = await tx.lockNextOpenLeg({ now: input.now, ...(input.policy.zone ? { zone: input.policy.zone } : {}) });
    if (!leg) return { ok: false, reason: "NO_OPEN_LEG" };
    const candidates = await tx.findCandidates(leg, input.policy.maxCandidates);
    for (const runnerId of candidates) {
      const runner = await tx.loadRunner(runnerId);
      if (!runner || !eligible(leg, runner, now)) {
        await tx.appendEvent({ missionId: leg.missionId, legId: leg.id, type: "dispatch.offer_rejected",
          actorId: input.dispatcherId, reason: "runner_revalidation_failed", occurredAt: input.now,
          idempotencyKey: input.idempotencyKey + ":" + runnerId });
        continue;
      }
      const offer: DispatchOffer = { id: input.offerId, legId: leg.id, missionId: leg.missionId, runnerId,
        status: "offered", expiresAt: new Date(now + input.policy.offerTtlSeconds * 1000).toISOString(),
        createdAt: input.now, version: 1 };
      await tx.createOffer(offer);
      await tx.appendEvent({ missionId: leg.missionId, legId: leg.id, type: "dispatch.offer_created",
        actorId: input.dispatcherId, reason: "eligible_runner_selected", occurredAt: input.now,
        idempotencyKey: input.idempotencyKey });
      await tx.enqueueOutbox({ eventId: input.eventId, aggregateId: offer.id, eventType: "dispatch.offer_created",
        payload: { offerId: offer.id, legId: leg.id, runnerId: runner.runnerId, expiresAt: offer.expiresAt } });
      return { ok: true, offer };
    }
    return { ok: false, reason: "NO_ELIGIBLE_RUNNER" };
  });
}
