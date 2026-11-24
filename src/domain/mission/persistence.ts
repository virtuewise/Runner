import type { Mission, MissionEvent } from "./types.ts";

export interface MissionTransaction {
  /** Locks/loads the current mission row for an atomic command. */
  loadMissionForUpdate(missionId: string): Promise<Mission | null>;
  /** Persists only when the stored version equals expectedVersion. */
  saveMission(mission: Mission, expectedVersion: number): Promise<boolean>;
  /** Appends events in the same transaction as the projection update. */
  appendEvents(events: readonly MissionEvent[]): Promise<void>;
  /** Claims an actor/scope/key tuple. Replays must return the original response. */
  claimIdempotency(input: {
    actorId: string;
    scope: string;
    key: string;
    requestHash: string;
  }): Promise<"claimed" | "replay" | "conflict">;
}

export interface MissionUnitOfWork {
  run<T>(work: (transaction: MissionTransaction) => Promise<T>): Promise<T>;
}

/**
 * Production adapters must implement this with one database transaction.
 * Never implement appendEvents and saveMission as independent commits.
 */
export interface MissionRepository {
  readonly unitOfWork: MissionUnitOfWork;
}
