import { confirmCustody, issueCustodyChallenge } from "../domain/mission/custody.ts";
import type { CustodyCrypto, CustodyRepository, CustodyChallenge } from "../domain/mission/custody.ts";
import type { OperationsPrincipal } from "../domain/mission/network-operations-queries.ts";

export interface AuthorizedCustodyIssue {
  readonly missionId: string;
  readonly legId: string;
  readonly receivingLegId?: string;
  readonly releasingActorId: string;
  readonly receivingActorId: string;
  readonly purpose: CustodyChallenge["purpose"];
}

/** Must re-check mission state, leg assignment and both parties against authoritative DB state. */
export interface CustodyAuthorization {
  authorizeIssue(input: {
    readonly principal: OperationsPrincipal;
    readonly missionId: string;
    readonly legId: string;
    readonly receivingLegId?: string;
    readonly purpose: CustodyChallenge["purpose"];
  }): Promise<AuthorizedCustodyIssue | null>;
}

export interface CustodyHandlerDependencies {
  readonly authenticate: (request: Request) => Promise<OperationsPrincipal | null>;
  readonly authorization: CustodyAuthorization;
  readonly repository: CustodyRepository;
  readonly crypto: CustodyCrypto;
  readonly now: () => string;
  readonly createId: () => string;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", pragma: "no-cache" },
});
const invalid = () => json({ error: "INVALID_REQUEST" }, 400);

export function createCustodyHandlers(deps: CustodyHandlerDependencies) {
  return {
    async issue(request: Request): Promise<Response> {
      if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
      const principal = await deps.authenticate(request);
      if (!principal) return json({ error: "UNAUTHENTICATED" }, 401);
      if (principal.role !== "runner" && principal.role !== "requester") return json({ error: "FORBIDDEN" }, 403);
      let body: unknown;
      try { body = await request.json(); } catch { return invalid(); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return invalid();
      const input = body as Record<string, unknown>;
      if (typeof input.missionId !== "string" || input.missionId.length < 1 || input.missionId.length > 128 ||
          typeof input.legId !== "string" || input.legId.length < 1 || input.legId.length > 128 ||
          !["pickup", "relay_handover", "final_delivery"].includes(String(input.purpose)) ||
          (input.receivingLegId !== undefined && (typeof input.receivingLegId !== "string" || input.receivingLegId.length > 128)) ||
          (input.ttlSeconds !== undefined && (typeof input.ttlSeconds !== "number" || !Number.isSafeInteger(input.ttlSeconds))))
        return invalid();
      const purpose = input.purpose as CustodyChallenge["purpose"];
      const authorized = await deps.authorization.authorizeIssue({
        principal, missionId: input.missionId, legId: input.legId,
        ...(typeof input.receivingLegId === "string" ? { receivingLegId: input.receivingLegId } : {}),
        purpose,
      });
      if (!authorized || authorized.releasingActorId !== principal.actorId) return json({ error: "FORBIDDEN" }, 403);
      const result = await issueCustodyChallenge({
        repository: deps.repository, crypto: deps.crypto, challengeId: deps.createId(),
        missionId: authorized.missionId, legId: authorized.legId,
        ...(authorized.receivingLegId ? { receivingLegId: authorized.receivingLegId } : {}),
        releasingActorId: authorized.releasingActorId, receivingActorId: authorized.receivingActorId,
        purpose, now: deps.now(), ttlSeconds: typeof input.ttlSeconds === "number" ? input.ttlSeconds : 300,
      });
      if (!result.ok) return json({ error: result.reason }, 409);
      // Plaintext token is returned once only. Persisted state contains only its SHA-256 digest.
      return json({ challenge: result.challenge, token: result.plaintextToken }, 201);
    },

    async confirm(request: Request, challengeId: string): Promise<Response> {
      if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
      const principal = await deps.authenticate(request);
      if (!principal) return json({ error: "UNAUTHENTICATED" }, 401);
      if (principal.role !== "runner" && principal.role !== "requester") return json({ error: "FORBIDDEN" }, 403);
      if (!challengeId || challengeId.length > 128) return invalid();
      let body: unknown;
      try { body = await request.json(); } catch { return invalid(); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return invalid();
      const token = (body as Record<string, unknown>).token;
      if (typeof token !== "string" || token.length > 512) return invalid();
      const result = await confirmCustody({
        repository: deps.repository, crypto: deps.crypto, challengeId,
        actorId: principal.actorId, token, now: deps.now(),
      });
      if (!result.ok) {
        const status = result.reason === "NOT_FOUND" ? 404 :
          result.reason === "FORBIDDEN" ? 403 :
          result.reason === "EXPIRED" ? 410 :
          result.reason === "INVALID_TOKEN" ? 422 : 409;
        return json({ error: result.reason }, status);
      }
      return json({ challenge: result.challenge });
    },
  };
}
