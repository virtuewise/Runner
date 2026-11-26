import type { Mission, MissionEvent, RunnerEligibility } from "./types.ts";

export type IdempotencyClaim =
  | { readonly kind: "claimed" }
  | { readonly kind: "replay"; readonly responseStatus: number; readonly responseBody: unknown }
  | { readonly kind: "conflict" };

export interface MissionTransaction {
  /** Inserts a newly created mission projection inside the current transaction. */
  insertMission(mission: Mission): Promise<void>;
  /** Locks/loads the current mission row for an atomic command. */
  loadMissionForUpdate(missionId: string): Promise<Mission | null>;
  /** Loads current qualification from authoritative server-side records. */
  loadRunnerEligibility(runnerId: string): Promise<RunnerEligibility | null>;
  /** Persists only when the stored version equals expectedVersion. */
  saveMission(mission: Mission, expectedVersion: number): Promise<boolean>;
  /** Appends events in the same transaction as the projection update. */
  appendEvents(events: readonly MissionEvent[]): Promise<void>;
  /** Claims a key; matching retries return the original response, mismatched bodies conflict. */
  claimIdempotency(input: {
    actorId: string;
    scope: string;
    key: string;
    requestHash: string;
  }): Promise<IdempotencyClaim>;
  /** Stores the response in the same transaction as the business operation. */
  completeIdempotency(input: {
    actorId: string;
    scope: string;
    key: string;
    responseStatus: number;
    responseBody: unknown;
  }): Promise<void>;
}

export interface MissionUnitOfWork {
  run<T>(work: (transaction: MissionTransaction) => Promise<T>): Promise<T>;
}

/**
 * Production adapters must implement this with one database transaction.
 * Idempotency receipt, projection update and event append must commit or roll back together.
 */
export interface MissionRepository {
  readonly unitOfWork: MissionUnitOfWork;
}
