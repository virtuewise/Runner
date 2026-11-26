import { acceptDispatchOffer, declineDispatchOffer } from "../domain/mission/dispatch-lifecycle.ts";
import { setRunnerLocationSharing, updateRunnerAvailability } from "../domain/mission/network-operations.ts";
import type { NetworkOperationsRepository, RunnerAvailabilityInput } from "../domain/mission/network-operations.ts";
import { placeMissionSafetyHold, reportMissionIncident, transitionMissionIncident } from "../domain/mission/incident-management.ts";
import type { IncidentRepository, IncidentCategory, IncidentSeverity, IncidentStatus } from "../domain/mission/incident-management.ts";
import type { ExecutionRepository } from "../domain/mission/execution-persistence.ts";
import type { OperationsPrincipal, PostgresNetworkOperationsQueries } from "../domain/mission/network-operations-queries.ts";

export interface NetworkOperationsHandlerDependencies {
  readonly authenticate: (request: Request) => Promise<OperationsPrincipal | null>;
  readonly executionRepository: ExecutionRepository;
  readonly availabilityRepository: NetworkOperationsRepository;
  readonly incidentRepository: IncidentRepository;
  readonly queries: Pick<PostgresNetworkOperationsQueries,
    "getRunnerAvailability" | "getRunnerOfferInbox" | "getMissionTracking" | "getDispatcherQueue" | "getIncidentQueue">;
  readonly now: () => string;
}
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const forbidden = () => json({ error: "FORBIDDEN" }, 403);
const unauthenticated = () => json({ error: "UNAUTHENTICATED" }, 401);
const methodNotAllowed = () => json({ error: "METHOD_NOT_ALLOWED" }, 405);
const invalidRequest = () => json({ error: "INVALID_REQUEST" }, 400);

export function createNetworkOperationsHandlers(deps: NetworkOperationsHandlerDependencies) {
  return {
    async incidentQueue(request: Request): Promise<Response> {
      if (request.method !== "GET") return methodNotAllowed();
      const principal = await deps.authenticate(request);
      if (!principal) return unauthenticated();
      if (principal.role !== "trust_operator") return forbidden();
      const url = new URL(request.url);
      const rawLimit = url.searchParams.get("limit");
      const limit = rawLimit === null ? 100 : Number(rawLimit);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 250) return invalidRequest();
      const incidents = await deps.queries.getIncidentQueue({principal,now:deps.now(),limit});
      return json({incidents});
    },

    async reportIncident(request: Request): Promise<Response> {
      if (request.method !== "POST") return methodNotAllowed();
      const principal = await deps.authenticate(request);
      if (!principal) return unauthenticated();
      let body: unknown;
      try { body = await request.json(); } catch { return invalidRequest(); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return invalidRequest();
      const input = body as Record<string, unknown>;
      if (typeof input.missionId !== "string" || typeof input.idempotencyKey !== "string" ||
          typeof input.category !== "string" || typeof input.severity !== "string" ||
          typeof input.title !== "string" || typeof input.description !== "string" ||
          (input.legId !== undefined && typeof input.legId !== "string") ||
          (input.evidenceRefs !== undefined && (!Array.isArray(input.evidenceRefs) || !input.evidenceRefs.every(x=>typeof x==="string"))))
        return invalidRequest();
      const result = await reportMissionIncident({
        repository:deps.incidentRepository,id:crypto.randomUUID(),missionId:input.missionId,
        ...(typeof input.legId==="string"?{legId:input.legId}:{}),
        actor:principal,idempotencyKey:input.idempotencyKey,category:input.category as IncidentCategory,
        severity:input.severity as IncidentSeverity,title:input.title,description:input.description,
        evidenceRefs:(input.evidenceRefs as string[]|undefined)??[],now:deps.now(),
      });
      return result.ok ? json({incident:result.incident,replayed:result.replayed===true}) :
        json({error:result.reason},result.reason==="FORBIDDEN"?403:404);
    },

    async transitionIncident(request: Request): Promise<Response> {
      if (request.method !== "POST") return methodNotAllowed();
      const principal = await deps.authenticate(request);
      if (!principal) return unauthenticated();
      if (principal.role !== "trust_operator") return forbidden();
      let body: unknown;
      try { body = await request.json(); } catch { return invalidRequest(); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return invalidRequest();
      const input = body as Record<string, unknown>;
      if (typeof input.incidentId!=="string" || typeof input.expectedVersion!=="number" ||
          typeof input.nextStatus!=="string" || typeof input.idempotencyKey!=="string") return invalidRequest();
      const result = await transitionMissionIncident({
        repository:deps.incidentRepository,incidentId:input.incidentId,actor:principal,
        expectedVersion:input.expectedVersion,nextStatus:input.nextStatus as IncidentStatus,
        idempotencyKey:input.idempotencyKey,
        ...(typeof input.assignedOperatorId==="string"?{assignedOperatorId:input.assignedOperatorId}:{}),
        ...(typeof input.resolutionCode==="string"?{resolutionCode:input.resolutionCode}:{}),
        ...(typeof input.resolutionNote==="string"?{resolutionNote:input.resolutionNote}:{}),now:deps.now(),
      });
      return result.ok ? json({incident:result.incident,replayed:result.replayed===true}) :
        json({error:result.reason},result.reason==="NOT_FOUND"?404:result.reason==="FORBIDDEN"?403:409);
    },

    async placeSafetyHold(request: Request): Promise<Response> {
      if (request.method !== "POST") return methodNotAllowed();
      const principal = await deps.authenticate(request);
      if (!principal) return unauthenticated();
      if (principal.role !== "trust_operator") return forbidden();
      let body: unknown;
      try { body = await request.json(); } catch { return invalidRequest(); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return invalidRequest();
      const input = body as Record<string, unknown>;
      if (typeof input.missionId!=="string" || typeof input.reason!=="string" ||
          typeof input.idempotencyKey!=="string") return invalidRequest();
      const result = await placeMissionSafetyHold({
        repository:deps.incidentRepository,missionId:input.missionId,actor:principal,
        reason:input.reason,idempotencyKey:input.idempotencyKey,now:deps.now(),
      });
      return result.ok ? json({placed:true,replayed:result.replayed===true}) :
        json({error:result.reason},result.reason==="FORBIDDEN"?403:result.reason==="NOT_FOUND"?404:409);
    },

    async runnerLocationSharing(request: Request): Promise<Response> {
      const principal = await deps.authenticate(request);
      if (!principal) return unauthenticated();
      if (principal.role !== "runner") return forbidden();
      if (request.method === "GET") {
        const enabled = await deps.availabilityRepository.getLocationSharing(principal.actorId);
        return json({purpose:"active_mission",enabled});
      }
      if (request.method !== "POST") return methodNotAllowed();
      let body: unknown;
      try { body = await request.json(); } catch { return invalidRequest(); }
      if (!body || typeof body !== "object" || Array.isArray(body) ||
          typeof (body as Record<string,unknown>).enabled !== "boolean") return invalidRequest();
      const enabled = (body as Record<string,unknown>).enabled as boolean;
      await setRunnerLocationSharing({
        repository:deps.availabilityRepository,authenticatedRunnerId:principal.actorId,enabled,now:deps.now(),
      });
      return json({purpose:"active_mission",enabled});
    },

    async runnerAvailability(request: Request): Promise<Response> {
      const principal = await deps.authenticate(request);
      if (!principal) return unauthenticated();
      if (principal.role !== "runner") return forbidden();
      if (request.method === "GET") {
        const windows = await deps.queries.getRunnerAvailability({
          authenticatedRunnerId: principal.actorId, now: deps.now(),
        });
        return json({ windows });
      }
      if (request.method !== "POST") return methodNotAllowed();
      let body: unknown;
      try { body = await request.json(); } catch { return invalidRequest(); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return invalidRequest();
      const input = body as Record<string, unknown>;
      if (typeof input.availableFrom !== "string" || typeof input.availableUntil !== "string" ||
          (input.status !== "available" && input.status !== "unavailable")) return invalidRequest();
      const result = await updateRunnerAvailability({
        repository: deps.availabilityRepository,
        authenticatedRunnerId: principal.actorId,
        window: input as unknown as RunnerAvailabilityInput,
        now: deps.now(),
      });
      return result.ok ? json({ updated: true }) : invalidRequest();
    },

    async runnerOffers(request: Request): Promise<Response> {
      if (request.method !== "GET") return methodNotAllowed();
      const principal = await deps.authenticate(request);
      if (!principal) return unauthenticated();
      if (principal.role !== "runner") return forbidden();
      const offers = await deps.queries.getRunnerOfferInbox({
        authenticatedRunnerId: principal.actorId, now: deps.now(),
      });
      return json({ offers });
    },

    async respondToOffer(request: Request): Promise<Response> {
      if (request.method !== "POST") return methodNotAllowed();
      const principal = await deps.authenticate(request);
      if (!principal) return unauthenticated();
      if (principal.role !== "runner") return forbidden();
      let body: unknown;
      try { body = await request.json(); } catch { return invalidRequest(); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return invalidRequest();
      const input = body as Record<string, unknown>;
      if (typeof input.offerId !== "string" || input.offerId.length < 1 || input.offerId.length > 128 ||
          (input.decision !== "accept" && input.decision !== "decline")) return invalidRequest();
      const command = {
        repository: deps.executionRepository, offerId: input.offerId,
        authenticatedRunnerId: principal.actorId, now: deps.now(),
      };
      const result = input.decision === "accept"
        ? await acceptDispatchOffer(command)
        : await declineDispatchOffer(command);
      if (!result.ok) {
        const status = result.reason === "NOT_FOUND" ? 404 :
          result.reason === "FORBIDDEN" ? 403 :
          result.reason === "EXPIRED" ? 410 :
          result.reason === "CONFLICT" ? 409 : 422;
        return json({ error: result.reason }, status);
      }
      return json({ offer: result.offer, replayed: result.replayed === true });
    },

    async missionTracking(request: Request, missionId: string): Promise<Response> {
      if (request.method !== "GET") return methodNotAllowed();
      const principal = await deps.authenticate(request);
      if (!principal) return unauthenticated();
      const tracking = await deps.queries.getMissionTracking({
        principal, missionId, now: deps.now(),
      });
      return tracking ? json({ mission: tracking }) : json({ error: "NOT_FOUND" }, 404);
    },

    async dispatcherQueue(request: Request): Promise<Response> {
      if (request.method !== "GET") return methodNotAllowed();
      const principal = await deps.authenticate(request);
      if (!principal) return unauthenticated();
      if (principal.role !== "dispatcher" && principal.role !== "trust_operator") return forbidden();
      const url = new URL(request.url);
      const rawLimit = url.searchParams.get("limit");
      const limit = rawLimit === null ? 100 : Number(rawLimit);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 250) return invalidRequest();
      const queue = await deps.queries.getDispatcherQueue({ principal, now: deps.now(), limit });
      return json({ queue });
    },
  };
}
