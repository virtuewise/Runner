import { acceptDispatchOffer, declineDispatchOffer } from "../domain/mission/dispatch-lifecycle.ts";
import type { ExecutionRepository } from "../domain/mission/execution-persistence.ts";
import type { OperationsPrincipal, PostgresNetworkOperationsQueries } from "../domain/mission/network-operations-queries.ts";

export interface NetworkOperationsHandlerDependencies {
  readonly authenticate: (request: Request) => Promise<OperationsPrincipal | null>;
  readonly executionRepository: ExecutionRepository;
  readonly queries: Pick<PostgresNetworkOperationsQueries,
    "getRunnerOfferInbox" | "getMissionTracking" | "getDispatcherQueue">;
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
