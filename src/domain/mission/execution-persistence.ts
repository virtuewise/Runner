import type { DispatchLeg, DispatchOffer, DispatchRunner, DispatchTransaction } from "./dispatch.ts";
import type { CustodyChallenge, CustodyTransaction } from "./custody.ts";

export interface ExecutionTransaction extends DispatchTransaction, CustodyTransaction {
  loadOfferForUpdate(offerId:string):Promise<DispatchOffer|null>;
  acceptOffer(input:{offerId:string;runnerId:string;now:string;expectedVersion:number}):Promise<boolean>;
  declineOffer(input:{offerId:string;runnerId:string;now:string;expectedVersion:number}):Promise<boolean>;
  expireOffers(now:string,limit:number):Promise<readonly DispatchOffer[]>;
  invalidateOffersForLeg(input:{legId:string;now:string;reason:string;actorId:string;actorRole:"dispatcher"|"trust_operator"}):Promise<number>;
  invalidateCustodyForLeg(input:{legId:string;now:string;actorId:string;actorRole:"dispatcher"|"trust_operator"}):Promise<number>;
  recordOfferEvent(input:{offer:DispatchOffer;actorId:string;actorRole:"runner"|"dispatcher"|"system";
    eventType:string;reason:string;occurredAt:string;idempotencyKey:string}):Promise<void>;
}
export interface ExecutionRepository { transaction<T>(work:(tx:ExecutionTransaction)=>Promise<T>):Promise<T>; }
export type { DispatchLeg,DispatchOffer,DispatchRunner,CustodyChallenge };
