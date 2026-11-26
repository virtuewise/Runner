import type { DispatchOffer } from "./dispatch.ts";
import type { ExecutionRepository } from "./execution-persistence.ts";

export type OfferCommandResult =
  | { readonly ok: true; readonly offer: DispatchOffer; readonly replayed?: boolean }
  | { readonly ok: false; readonly reason: "NOT_FOUND" | "FORBIDDEN" | "EXPIRED" | "NOT_PENDING" | "CONFLICT" };

export async function acceptDispatchOffer(input: {
  repository: ExecutionRepository; offerId: string; authenticatedRunnerId: string; now: string;
}): Promise<OfferCommandResult> {
  if (!Number.isFinite(Date.parse(input.now)) || !input.offerId || !input.authenticatedRunnerId)
    throw new Error("Invalid offer acceptance");
  return input.repository.transaction(async (tx) => {
    const offer = await tx.loadOfferForUpdate(input.offerId);
    if (!offer) return { ok: false, reason: "NOT_FOUND" };
    if (offer.runnerId !== input.authenticatedRunnerId) return { ok: false, reason: "FORBIDDEN" };
    if (offer.status === "accepted") return { ok: true, offer, replayed: true };
    if (offer.status !== "offered") return { ok: false, reason: "NOT_PENDING" };
    if (Date.parse(offer.expiresAt) <= Date.parse(input.now)) return { ok: false, reason: "EXPIRED" };
    if (!await tx.acceptOffer({ offerId: offer.id, runnerId: input.authenticatedRunnerId, now: input.now, expectedVersion: offer.version }))
      return { ok: false, reason: "CONFLICT" };
    const accepted = { ...offer, status: "accepted" as const, version: offer.version + 1 };
    await tx.recordOfferEvent({ offer: accepted, actorId: input.authenticatedRunnerId, actorRole: "runner",
      eventType: "dispatch.offer_accepted", reason: "runner_accepted_offer", occurredAt: input.now,
      idempotencyKey: "accept:" + offer.id });
    return { ok: true, offer: accepted };
  });
}

export async function declineDispatchOffer(input: {
  repository: ExecutionRepository; offerId: string; authenticatedRunnerId: string; now: string;
}): Promise<OfferCommandResult> {
  if (!Number.isFinite(Date.parse(input.now)) || !input.offerId || !input.authenticatedRunnerId)
    throw new Error("Invalid offer decline");
  return input.repository.transaction(async (tx) => {
    const offer = await tx.loadOfferForUpdate(input.offerId);
    if (!offer) return { ok: false, reason: "NOT_FOUND" };
    if (offer.runnerId !== input.authenticatedRunnerId) return { ok: false, reason: "FORBIDDEN" };
    if (offer.status === "declined") return { ok: true, offer, replayed: true };
    if (offer.status !== "offered") return { ok: false, reason: "NOT_PENDING" };
    if (Date.parse(offer.expiresAt) <= Date.parse(input.now)) return { ok: false, reason: "EXPIRED" };
    if (!await tx.declineOffer({ offerId: offer.id, runnerId: input.authenticatedRunnerId, now: input.now, expectedVersion: offer.version }))
      return { ok: false, reason: "CONFLICT" };
    const declined = { ...offer, status: "declined" as const, version: offer.version + 1 };
    await tx.recordOfferEvent({ offer: declined, actorId: input.authenticatedRunnerId, actorRole: "runner",
      eventType: "dispatch.offer_declined", reason: "runner_declined_offer", occurredAt: input.now,
      idempotencyKey: "decline:" + offer.id });
    return { ok: true, offer: declined };
  });
}

export async function expireDispatchOffers(input: {
  repository: ExecutionRepository; now: string; batchSize?: number;
}): Promise<number> {
  const now = Date.parse(input.now), limit = input.batchSize ?? 100;
  if (!Number.isFinite(now) || !Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
    throw new Error("Invalid offer expiry batch");
  return input.repository.transaction(async (tx) => {
    const expired = await tx.expireOffers(input.now, limit);
    for (const offer of expired) await tx.recordOfferEvent({ offer: { ...offer, status: "expired" },
      actorId: "00000000-0000-0000-0000-000000000000", actorRole: "system",
      eventType: "dispatch.offer_expired", reason: "offer_ttl_elapsed", occurredAt: input.now,
      idempotencyKey: "expire:" + offer.id });
    return expired.length;
  });
}

export async function reassignDispatchLeg(input: {
  repository: ExecutionRepository; legId: string; now: string; actorId: string; actorRole: "dispatcher" | "trust_operator"; reason: string; idempotencyKey: string;
}): Promise<{ offersRevoked: number; challengesInvalidated: number }> {
  if (!input.legId || !input.actorId || !input.reason.trim() || !input.idempotencyKey || !Number.isFinite(Date.parse(input.now)))
    throw new Error("Invalid reassignment command");
  return input.repository.transaction(async (tx) => {
    await tx.lockDispatchIdempotency(input.actorId, "reassign:" + input.legId + ":" + input.idempotencyKey);
    if (await tx.hasReassignmentEvent({ legId: input.legId, actorId: input.actorId, idempotencyKey: "reassign:" + input.legId + ":" + input.idempotencyKey }))
      return { offersRevoked: 0, challengesInvalidated: 0 };
    const offersRevoked = await tx.invalidateOffersForLeg({ legId: input.legId, now: input.now, reason: input.reason, actorId: input.actorId, actorRole: input.actorRole });
    const challengesInvalidated = await tx.invalidateCustodyForLeg({ legId: input.legId, now: input.now, actorId: input.actorId, actorRole: input.actorRole });
    await tx.appendReassignmentEvent({ legId: input.legId, actorId: input.actorId, actorRole: input.actorRole,
      reason: input.reason, occurredAt: input.now, idempotencyKey: "reassign:" + input.legId + ":" + input.idempotencyKey });
    return { offersRevoked, challengesInvalidated };
  });
}
