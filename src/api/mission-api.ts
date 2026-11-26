import { createHash, randomUUID } from "node:crypto";
import {
  attachQuote, calculateQuote, createMission, publishMission,
  type CommandContext, type Mission, type MissionQuote, type MissionRepository,
  type MissionTerms, type PricingPolicy,
} from "../domain/mission/index.ts";

export interface AuthenticatedPrincipal {
  readonly actorId: string;
  readonly role: CommandContext["actorRole"];
}
export interface MissionApiDependencies {
  readonly repository: MissionRepository;
  readonly authenticate: (request: Request) => Promise<AuthenticatedPrincipal | null>;
  readonly pricingPolicy: (terms: MissionTerms) => PricingPolicy;
  readonly estimateDistanceMetres: (terms: MissionTerms) => Promise<number>;
  readonly screenManifest: (terms: MissionTerms) => Promise<boolean>;
  readonly pricingServiceActorId: string;
  readonly now?: () => string;
  readonly newId?: () => string;
}
interface ApiError {
  readonly error: { readonly code: string; readonly message: string; readonly requestId: string };
}
interface ApiSuccess {
  readonly data: unknown;
  readonly requestId: string;
}
class ApiFault extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
type JsonRecord = Record<string, unknown>;

function response(status: number, body: unknown, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}
function fail(status: number, code: string, message: string, requestId: string): Response {
  const body: ApiError = { error: { code, message, requestId } };
  return response(status, body);
}
function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isAddress(value: unknown): value is MissionTerms["pickup"] {
  if (!isRecord(value)) return false;
  return typeof value.countryCode === "string" && /^[A-Z]{2}$/.test(value.countryCode) &&
    typeof value.locality === "string" && value.locality.trim().length > 0 &&
    typeof value.addressLine === "string" && value.addressLine.trim().length > 0 &&
    (value.latitude === undefined || (typeof value.latitude === "number" && Number.isFinite(value.latitude) && value.latitude >= -90 && value.latitude <= 90)) &&
    (value.longitude === undefined || (typeof value.longitude === "number" && Number.isFinite(value.longitude) && value.longitude >= -180 && value.longitude <= 180));
}
function parseTerms(value: unknown): MissionTerms | null {
  if (!isRecord(value) || !isAddress(value.pickup) || !isAddress(value.destination)) return null;
  const categories = ["document", "parcel", "retail_collection", "other"];
  const vehicleClasses = ["foot", "bicycle", "motorcycle", "car", "van"];
  if (typeof value.category !== "string" || !categories.includes(value.category) ||
      typeof value.description !== "string" || value.description.trim().length < 3 || value.description.length > 2000 ||
      typeof value.currency !== "string" || !/^[A-Z]{3}$/.test(value.currency) ||
      !Number.isSafeInteger(value.declaredValueMinor) || Number(value.declaredValueMinor) < 0 ||
      !Number.isSafeInteger(value.weightGrams) || Number(value.weightGrams) < 0 ||
      !Array.isArray(value.requiredCapabilities) || value.requiredCapabilities.some((item) => typeof item !== "string" || item.length > 80) ||
      (value.requiredVehicleClass !== undefined && (typeof value.requiredVehicleClass !== "string" || !vehicleClasses.includes(value.requiredVehicleClass)))) return null;
  return {
    category: value.category as MissionTerms["category"],
    description: value.description.trim(),
    currency: value.currency,
    declaredValueMinor: Number(value.declaredValueMinor),
    weightGrams: Number(value.weightGrams),
    pickup: value.pickup,
    destination: value.destination,
    requiredCapabilities: value.requiredCapabilities as string[],
    ...(typeof value.requiredVehicleClass === "string" ? { requiredVehicleClass: value.requiredVehicleClass as NonNullable<MissionTerms["requiredVehicleClass"]> } : {}),
    // This is set only after the server-side screening dependency approves the manifest.
    prohibitedItemScreeningPassed: false,
  };
}
function hash(rawBody: string): string {
  return createHash("sha256").update(rawBody, "utf8").digest("hex");
}
function context(principal: AuthenticatedPrincipal, idempotencyKey: string, now: string, eventId: string, role = principal.role, actorId = principal.actorId): CommandContext {
  return { actorId, actorRole: role, occurredAt: now, eventId, idempotencyKey };
}
function domainFault(result: { readonly error: { readonly code: string; readonly message: string } }): ApiFault {
  const status = result.error.code === "FORBIDDEN" ? 403 :
    result.error.code === "VERSION_CONFLICT" || result.error.code === "IDEMPOTENCY_CONFLICT" ? 409 :
    result.error.code === "INELIGIBLE_RUNNER" ? 422 : 400;
  return new ApiFault(status, result.error.code, result.error.message);
}
function versionHeader(request: Request): number | null {
  const value = request.headers.get("if-match");
  if (!value || !/^"?(0|[1-9][0-9]*)"?$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
function idempotencyKey(request: Request): string | null {
  const value = request.headers.get("idempotency-key");
  return value && /^[A-Za-z0-9._:-]{16,128}$/.test(value) ? value : null;
}
function authorizedToRead(mission: Mission, principal: AuthenticatedPrincipal): boolean {
  return mission.requesterId === principal.actorId || mission.assignedRunnerId === principal.actorId ||
    principal.role === "dispatcher" || principal.role === "trust_operator";
}

export function createMissionApi(deps: MissionApiDependencies): (request: Request) => Promise<Response> {
  const now = deps.now ?? (() => new Date().toISOString());
  const newId = deps.newId ?? randomUUID;

  return async (request: Request): Promise<Response> => {
    const requestId = newId();
    try {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/health") {
        return response(200, { data: { status: "ok" }, requestId });
      }
      const principal = await deps.authenticate(request);
      if (!principal) return fail(401, "UNAUTHENTICATED", "Authentication is required.", requestId);
      if (!principal.actorId || !["requester", "runner", "dispatcher", "trust_operator"].includes(principal.role)) {
        return fail(403, "INVALID_PRINCIPAL", "The authenticated identity is not authorized for this API.", requestId);
      }

      if (request.method === "POST" && url.pathname === "/v1/missions") {
        if (principal.role !== "requester") return fail(403, "FORBIDDEN", "Only requester accounts can create missions.", requestId);
        const key = idempotencyKey(request);
        if (!key) return fail(400, "IDEMPOTENCY_KEY_REQUIRED", "Provide a valid Idempotency-Key header.", requestId);
        const raw = await request.text();
        if (raw.length > 32_768) return fail(413, "PAYLOAD_TOO_LARGE", "Mission request exceeds the allowed size.", requestId);
        let payload: unknown;
        try { payload = JSON.parse(raw); } catch { return fail(400, "INVALID_JSON", "Request body must be valid JSON.", requestId); }
        const terms = isRecord(payload) ? parseTerms(payload.terms) : null;
        if (!terms) return fail(400, "INVALID_MISSION_TERMS", "Mission terms are incomplete or invalid.", requestId);
        if (!await deps.screenManifest(terms)) return fail(422, "MANIFEST_SCREENING_REQUIRED", "The manifest has not passed the required item and regulatory screening.", requestId);
        const screenedTerms: MissionTerms = { ...terms, prohibitedItemScreeningPassed: true };
        return deps.repository.unitOfWork.run(async (tx) => {
          const claim = await tx.claimIdempotency({ actorId: principal.actorId, scope: "mission.create", key, requestHash: hash(raw) });
          if (claim.kind === "replay") return response(claim.responseStatus, claim.responseBody);
          if (claim.kind === "conflict") return fail(409, "IDEMPOTENCY_KEY_REUSED", "This key was already used with a different or incomplete request.", requestId);
          const result = createMission({ id: newId(), requesterId: principal.actorId, terms: screenedTerms, context: context(principal, key, now(), newId()) });
          if (!result.ok) throw domainFault(result);
          await tx.insertMission(result.value);
          await tx.appendEvents(result.events);
          const body: ApiSuccess = { data: result.value, requestId };
          await tx.completeIdempotency({ actorId: principal.actorId, scope: "mission.create", key, responseStatus: 201, responseBody: body });
          return response(201, body, { location: `/v1/missions/${result.value.id}`, etag: `"${result.value.version}"` });
        });
      }

      const missionMatch = url.pathname.match(/^\/v1\/missions\/([0-9a-f-]{36})(?:\/(quote|publish))?$/i);
      if (missionMatch && request.method === "GET" && !missionMatch[2]) {
        const mission = await deps.repository.unitOfWork.run((tx) => tx.loadMission(missionMatch[1]));
        if (!mission || !authorizedToRead(mission, principal)) return fail(404, "MISSION_NOT_FOUND", "Mission was not found.", requestId);
        return response(200, { data: mission, requestId }, { etag: `"${mission.version}"` });
      }

      if (missionMatch && request.method === "POST" && (missionMatch[2] === "quote" || missionMatch[2] === "publish")) {
        const missionId = missionMatch[1];
        const action = missionMatch[2];
        const key = idempotencyKey(request);
        const expectedVersion = versionHeader(request);
        if (!key) return fail(400, "IDEMPOTENCY_KEY_REQUIRED", "Provide a valid Idempotency-Key header.", requestId);
        if (expectedVersion === null) return fail(428, "IF_MATCH_REQUIRED", "Provide the expected mission version in If-Match.", requestId);
        const raw = await request.text();
        if (raw.length > 4096) return fail(413, "PAYLOAD_TOO_LARGE", "Request exceeds the allowed size.", requestId);
        if (raw.trim() !== "" && raw.trim() !== "{}") return fail(400, "UNEXPECTED_BODY", "This command does not accept client-supplied pricing or state.", requestId);
        const scope = `mission.${action}:${missionId}`;
        return deps.repository.unitOfWork.run(async (tx) => {
          const claim = await tx.claimIdempotency({ actorId: principal.actorId, scope, key, requestHash: hash(raw) });
          if (claim.kind === "replay") return response(claim.responseStatus, claim.responseBody);
          if (claim.kind === "conflict") return fail(409, "IDEMPOTENCY_KEY_REUSED", "This key was already used with a different or incomplete request.", requestId);
          const mission = await tx.loadMissionForUpdate(missionId);
          if (!mission || (mission.requesterId !== principal.actorId && principal.role !== "dispatcher")) throw new ApiFault(404, "MISSION_NOT_FOUND", "Mission was not found.");
          if (action === "quote") {
            if (principal.role !== "requester") throw new ApiFault(403, "FORBIDDEN", "Only the requester can request a quote.");
            const distance = await deps.estimateDistanceMetres(mission.terms);
            const quote: MissionQuote = calculateQuote({ terms: mission.terms, estimatedDistanceMetres: distance, policy: deps.pricingPolicy(mission.terms), now: now() });
            const result = attachQuote(mission, quote, context(principal, key, now(), newId(), "system", deps.pricingServiceActorId), expectedVersion);
            if (!result.ok) throw domainFault(result);
            if (!await tx.saveMission(result.value, expectedVersion)) throw new ApiFault(409, "MISSION_VERSION_CONFLICT", "Mission changed; refresh and retry.");
            await tx.appendEvents(result.events);
            const body: ApiSuccess = { data: result.value, requestId };
            await tx.completeIdempotency({ actorId: principal.actorId, scope, key, responseStatus: 200, responseBody: body });
            return response(200, body, { etag: `"${result.value.version}"` });
          }
          if (principal.role !== "requester" || mission.requesterId !== principal.actorId) throw new ApiFault(403, "FORBIDDEN", "Only the requester can publish this mission.");
          const result = publishMission(mission, context(principal, key, now(), newId()), expectedVersion);
          if (!result.ok) throw domainFault(result);
          if (!await tx.saveMission(result.value, expectedVersion)) throw new ApiFault(409, "MISSION_VERSION_CONFLICT", "Mission changed; refresh and retry.");
          await tx.appendEvents(result.events);
          const body: ApiSuccess = { data: result.value, requestId };
          await tx.completeIdempotency({ actorId: principal.actorId, scope, key, responseStatus: 200, responseBody: body });
          return response(200, body, { etag: `"${result.value.version}"` });
        });
      }
      return fail(404, "ROUTE_NOT_FOUND", "The requested API route does not exist.", requestId);
    } catch (error) {
      if (error instanceof ApiFault) return fail(error.status, error.code, error.message, requestId);
      return fail(500, "INTERNAL_ERROR", "The request could not be completed.", requestId);
    }
  };
}
