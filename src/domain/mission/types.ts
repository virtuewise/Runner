export const MISSION_STATUSES = [
  "draft", "quoted", "open", "assigned", "runner_en_route", "at_pickup",
  "in_custody", "en_route_to_destination", "delivered", "closed",
  "cancelled", "expired", "failed", "disputed", "safety_hold",
] as const;

export type MissionStatus = (typeof MISSION_STATUSES)[number];
export type MissionId = string;
export type ActorId = string;
export type CurrencyCode = string;

export interface GeoAddress {
  readonly countryCode: string;
  readonly region?: string;
  readonly locality: string;
  readonly addressLine: string;
  readonly postalCode?: string;
  readonly latitude?: number;
  readonly longitude?: number;
}

export interface MissionTerms {
  readonly category: "document" | "parcel" | "retail_collection" | "other";
  readonly description: string;
  readonly declaredValueMinor: number;
  readonly weightGrams: number;
  readonly pickup: GeoAddress;
  readonly destination: GeoAddress;
  readonly requiredCapabilities: readonly string[];
  readonly requiredVehicleClass?: "foot" | "bicycle" | "motorcycle" | "car" | "van";
  readonly prohibitedItemScreeningPassed: boolean;
}

export interface Money {
  readonly amountMinor: number;
  readonly currency: CurrencyCode;
}

export interface MissionQuote {
  readonly base: Money;
  readonly distance: Money;
  readonly handling: Money;
  readonly platformFee: Money;
  readonly runnerReward: Money;
  readonly requesterTotal: Money;
  readonly expiresAt: string;
  readonly pricingVersion: string;
}

export interface Mission {
  readonly id: MissionId;
  readonly requesterId: ActorId;
  readonly status: MissionStatus;
  readonly terms: MissionTerms;
  readonly quote?: MissionQuote;
  readonly assignedRunnerId?: ActorId;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}

export interface RunnerEligibility {
  readonly runnerId: ActorId;
  readonly identityVerified: boolean;
  readonly qualified: boolean;
  readonly active: boolean;
  readonly capabilities: readonly string[];
  readonly vehicleClass?: "foot" | "bicycle" | "motorcycle" | "car" | "van";
  readonly jurisdictionCodes: readonly string[];
}

export type MissionEventType =
  | "mission.created" | "mission.quoted" | "mission.opened"
  | "mission.assigned" | "mission.status_changed" | "mission.cancelled";

export interface MissionEvent {
  readonly eventId: string;
  readonly missionId: MissionId;
  readonly sequence: number;
  readonly type: MissionEventType;
  readonly occurredAt: string;
  readonly actorId: ActorId;
  readonly idempotencyKey: string;
  readonly fromStatus?: MissionStatus;
  readonly toStatus: MissionStatus;
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}

export interface CommandContext {
  readonly actorId: ActorId;
  readonly actorRole: "requester" | "runner" | "dispatcher" | "trust_operator" | "system";
  readonly occurredAt: string;
  readonly eventId: string;
  readonly idempotencyKey: string;
}

export type DomainResult<T> =
  | { readonly ok: true; readonly value: T; readonly events: readonly MissionEvent[] }
  | { readonly ok: false; readonly error: DomainError };

export interface DomainError {
  readonly code: "INVALID_INPUT" | "INVALID_TRANSITION" | "FORBIDDEN" |
    "INELIGIBLE_RUNNER" | "MISSING_QUOTE" | "QUOTE_EXPIRED" |
    "VERSION_CONFLICT" | "IDEMPOTENCY_CONFLICT";
  readonly message: string;
}
