import type { DispatchLeg, DispatchOffer, DispatchRunner, DispatchTransaction, DispatchRepository } from "./dispatch.ts";
import type { CustodyChallenge, CustodyTransaction, CustodyRepository } from "./custody.ts";

export interface ExecutionTransaction extends DispatchTransaction, CustodyTransaction {
  findOfferByIdempotencyKey(dispatcherId: string, key: string): Promise<DispatchOffer | null>;
  loadOfferForUpdate(offerId: string): Promise<DispatchOffer | null>;
  acceptOffer(input: { offerId: string; runnerId: string; now: string; expectedVersion: number }): Promise<boolean>;
  declineOffer(input: { offerId: string; runnerId: string; now: string; expectedVersion: number }): Promise<boolean>;
  expireOffers(now: string, limit: number): Promise<readonly DispatchOffer[]>;
  invalidateOffersForLeg(input: { legId: string; now: string; reason: string }): Promise<number>;
  invalidateCustodyForLeg(input: { legId: string; now: string }): Promise<number>;
  recordOfferEvent(input: { offer: DispatchOffer; actorId: string; actorRole: "runner" | "dispatcher" | "system"; eventType: string; reason: string; occurredAt: string; idempotencyKey: string }): Promise<void>;
}
export interface ExecutionRepository extends DispatchRepository, CustodyRepository {
  transaction<T>(work: (tx: ExecutionTransaction) => Promise<T>): Promise<T>;
}
export type { DispatchLeg, DispatchOffer, DispatchRunner, CustodyChallenge };
