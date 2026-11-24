import { canTransition, isRunnerEligible } from "./policy";
import type {
  CommandContext, DomainResult, Mission, MissionEvent, MissionQuote,
  MissionStatus, MissionTerms, RunnerEligibility,
} from "./types";

function failure<T>(code: Extract<DomainResult<T>, { ok: false }>["error"]["code"], message: string): DomainResult<T> {
  return { ok: false, error: { code, message } };
}

function event(
  mission: Mission,
  context: CommandContext,
  type: MissionEvent["type"],
  toStatus: MissionStatus,
  fromStatus?: MissionStatus,
  metadata?: Readonly<Record<string, string | number | boolean>>,
): MissionEvent {
  return {
    eventId: context.eventId,
    missionId: mission.id,
    sequence: mission.version + 1,
    type,
    occurredAt: context.occurredAt,
    actorId: context.actorId,
    idempotencyKey: context.idempotencyKey,
    ...(fromStatus ? { fromStatus } : {}),
    toStatus,
    ...(metadata ? { metadata } : {}),
  };
}

function validContext(context: CommandContext): boolean {
  return Boolean(context.actorId && context.eventId && context.idempotencyKey) &&
    Number.isFinite(Date.parse(context.occurredAt));
}

function validTerms(terms: MissionTerms): boolean {
  return Boolean(terms.description.trim() && terms.pickup.countryCode &&
    terms.destination.countryCode && terms.pickup.locality && terms.destination.locality &&
    terms.pickup.addressLine && terms.destination.addressLine) &&
    Number.isSafeInteger(terms.declaredValueMinor) && terms.declaredValueMinor >= 0 &&
    Number.isSafeInteger(terms.weightGrams) && terms.weightGrams >= 0 &&
    terms.prohibitedItemScreeningPassed;
}

export function createMission(input: {
  readonly id: string;
  readonly requesterId: string;
  readonly terms: MissionTerms;
  readonly context: CommandContext;
}): DomainResult<Mission> {
  const { id, requesterId, terms, context } = input;
  if (!id || !requesterId || !validContext(context) || !validTerms(terms)) {
    return failure("INVALID_INPUT", "Mission identity, command context or declared terms are invalid.");
  }
  if (context.actorId !== requesterId || context.actorRole !== "requester") return failure("FORBIDDEN", "Only the requesting account can create this mission.");
  const mission: Mission = {
    id, requesterId, status: "draft", terms,
    createdAt: context.occurredAt, updatedAt: context.occurredAt, version: 0,
  };
  const created = event(mission, context, "mission.created", "draft");
  return { ok: true, value: mission, events: [created] };
}

export function attachQuote(
  mission: Mission, quote: MissionQuote, context: CommandContext,
  expectedVersion: number,
): DomainResult<Mission> {
  if (!validContext(context)) return failure("INVALID_INPUT", "Command context is invalid.");
  if (mission.version !== expectedVersion) return failure("VERSION_CONFLICT", "Mission changed; reload before retrying.");
  if (context.actorId !== mission.requesterId || context.actorRole !== "requester") return failure("FORBIDDEN", "Only the requesting account can quote this mission.");
  if (mission.status !== "draft") return failure("INVALID_TRANSITION", "Only draft missions can be quoted.");
  if (Date.parse(quote.expiresAt) <= Date.parse(context.occurredAt) ||
      !Number.isSafeInteger(quote.requesterTotal.amountMinor) || quote.requesterTotal.amountMinor < 0 ||
      !quote.requesterTotal.currency || !quote.pricingVersion) {
    return failure("INVALID_INPUT", "Quote is invalid or already expired.");
  }
  const next: Mission = { ...mission, status: "quoted", quote, updatedAt: context.occurredAt, version: mission.version + 1 };
  return { ok: true, value: next, events: [event(mission, context, "mission.quoted", "quoted", "draft", { pricingVersion: quote.pricingVersion })] };
}

export function publishMission(
  mission: Mission, context: CommandContext, expectedVersion: number,
): DomainResult<Mission> {
  if (!validContext(context)) return failure("INVALID_INPUT", "Command context is invalid.");
  if (mission.version !== expectedVersion) return failure("VERSION_CONFLICT", "Mission changed; reload before retrying.");
  if (context.actorId !== mission.requesterId || context.actorRole !== "requester") return failure("FORBIDDEN", "Only the requesting account can publish this mission.");
  if (mission.status !== "quoted" || !mission.quote) return failure("MISSING_QUOTE", "A valid quote is required before publication.");
  if (Date.parse(mission.quote.expiresAt) <= Date.parse(context.occurredAt)) return failure("QUOTE_EXPIRED", "The quote has expired; request a fresh quote.");
  const next: Mission = { ...mission, status: "open", updatedAt: context.occurredAt, version: mission.version + 1 };
  return { ok: true, value: next, events: [event(mission, context, "mission.opened", "open", "quoted")] };
}

export function assignRunner(
  mission: Mission, runner: RunnerEligibility, context: CommandContext,
  expectedVersion: number,
): DomainResult<Mission> {
  if (!validContext(context)) return failure("INVALID_INPUT", "Command context is invalid.");
  if (mission.version !== expectedVersion) return failure("VERSION_CONFLICT", "Mission changed; reload before retrying.");
  if (context.actorRole !== "dispatcher" && context.actorRole !== "system") return failure("FORBIDDEN", "Only dispatch operations can assign a Runner.");
  if (mission.status !== "open") return failure("INVALID_TRANSITION", "Only open missions can be assigned.");
  if (!isRunnerEligible(mission, runner)) return failure("INELIGIBLE_RUNNER", "Runner does not satisfy mission qualification or jurisdiction policy.");
  const next: Mission = { ...mission, status: "assigned", assignedRunnerId: runner.runnerId, updatedAt: context.occurredAt, version: mission.version + 1 };
  return { ok: true, value: next, events: [event(mission, context, "mission.assigned", "assigned", "open", { runnerId: runner.runnerId })] };
}

export function transitionMission(
  mission: Mission, toStatus: MissionStatus, context: CommandContext,
  expectedVersion: number,
): DomainResult<Mission> {
  if (!validContext(context)) return failure("INVALID_INPUT", "Command context is invalid.");
  if (mission.version !== expectedVersion) return failure("VERSION_CONFLICT", "Mission changed; reload before retrying.");
  const isRequesterCancellation = toStatus === "cancelled" && context.actorId === mission.requesterId && context.actorRole === "requester";
  const isAssignedRunner = Boolean(mission.assignedRunnerId && context.actorId === mission.assignedRunnerId && context.actorRole === "runner");
  const isTrustAction = context.actorRole === "trust_operator" && (toStatus === "safety_hold" || toStatus === "disputed" || toStatus === "closed");
  if (!isRequesterCancellation && !isAssignedRunner && !isTrustAction) return failure("FORBIDDEN", "Actor is not authorized for this mission transition.");
  if (!canTransition(mission.status, toStatus)) return failure("INVALID_TRANSITION", `Transition ${mission.status} -> ${toStatus} is not allowed.`);
  const next: Mission = { ...mission, status: toStatus, updatedAt: context.occurredAt, version: mission.version + 1 };
  return { ok: true, value: next, events: [event(mission, context, toStatus === "cancelled" ? "mission.cancelled" : "mission.status_changed", toStatus, mission.status)] };
}
