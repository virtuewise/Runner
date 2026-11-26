import type {
  DispatcherQueueItem,
  IncidentQueueItem,
  MissionTrackingView,
  RunnerAvailabilityView,
  RunnerOfferInboxItem,
} from "../domain/mission/network-operations-queries.ts";

export interface AuthenticatedApiSession {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
}

export interface RunnerAvailabilityInput {
  readonly availableFrom: string;
  readonly availableUntil: string;
  readonly status: "available" | "unavailable";
}

export interface RunnerLocationSharing {
  readonly purpose: "active_mission";
  readonly enabled: boolean;
}

function resourceId(value: string, name: string): string {
  if (!value || value.length > 128) throw new Error(`Invalid ${name}`);
  return encodeURIComponent(value);
}

function boundedLimit(limit: number): number {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 250)
    throw new Error("Limit must be an integer between 1 and 250");
  return limit;
}

/** Typed mobile-facing adapter for the authenticated, server-authoritative operations API. */
export function createRunnerOperationsClient(session: AuthenticatedApiSession) {
  return {
    async getOffers(): Promise<readonly RunnerOfferInboxItem[]> {
      const result = await session.get<{ offers: readonly RunnerOfferInboxItem[] }>("/v1/runner/offers");
      return result.offers;
    },

    async respondToOffer(offerId: string, decision: "accept" | "decline"): Promise<void> {
      await session.post("/v1/runner/offers/respond", {
        offerId: resourceId(offerId, "offer ID"), decision,
      });
    },

    async getAvailability(): Promise<readonly RunnerAvailabilityView[]> {
      const result = await session.get<{ windows: readonly RunnerAvailabilityView[] }>("/v1/runner/availability");
      return result.windows;
    },

    async setAvailability(window: RunnerAvailabilityInput): Promise<void> {
      if (!Number.isFinite(Date.parse(window.availableFrom)) ||
          !Number.isFinite(Date.parse(window.availableUntil)) ||
          Date.parse(window.availableUntil) <= Date.parse(window.availableFrom))
        throw new Error("Availability must have a valid, increasing time window");
      await session.post("/v1/runner/availability", window);
    },

    getLocationSharing(): Promise<RunnerLocationSharing> {
      return session.get<RunnerLocationSharing>("/v1/runner/location-sharing");
    },

    setLocationSharing(enabled: boolean): Promise<RunnerLocationSharing> {
      return session.post<RunnerLocationSharing>("/v1/runner/location-sharing", { enabled });
    },

    async getDispatcherQueue(limit = 100): Promise<readonly DispatcherQueueItem[]> {
      const result = await session.get<{ queue: readonly DispatcherQueueItem[] }>(
        `/v1/operations/dispatch-queue?limit=${boundedLimit(limit)}`,
      );
      return result.queue;
    },

    async getIncidentQueue(limit = 100): Promise<readonly IncidentQueueItem[]> {
      const result = await session.get<{ incidents: readonly IncidentQueueItem[] }>(
        `/v1/operations/incidents?limit=${boundedLimit(limit)}`,
      );
      return result.incidents;
    },

    async getMissionTracking(missionId: string): Promise<MissionTrackingView> {
      const result = await session.get<{ mission: MissionTrackingView }>(
        `/v1/missions/${resourceId(missionId, "mission ID")}/tracking`,
      );
      return result.mission;
    },
  };
}
