import type { OperationsPrincipal } from "../domain/mission/network-operations-queries.ts";

export interface VerifiedAccessTokenClaims {
  readonly sub: string;
  readonly iss: string;
  readonly aud: string | readonly string[];
  readonly exp: number;
  readonly nbf?: number;
  readonly jti?: string;
  readonly role: OperationsPrincipal["role"];
}

/** Implement with a JOSE/JWT library configured for a fixed algorithm and trusted issuer keys. */
export interface AccessTokenVerifier {
  verify(token: string): Promise<unknown>;
}

export interface BearerAuthenticationConfig {
  readonly issuer: string;
  readonly audience: string;
  readonly nowSeconds?: () => number;
  readonly clockToleranceSeconds?: number;
}

const ROLES = new Set(["runner", "requester", "dispatcher", "trust_operator"]);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Validates claims after cryptographic signature verification by the injected verifier. */
export function createBearerAuthenticator(
  verifier: AccessTokenVerifier,
  config: BearerAuthenticationConfig,
): (request: Request) => Promise<OperationsPrincipal | null> {
  const nowSeconds = config.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
  const tolerance = config.clockToleranceSeconds ?? 30;
  if (!config.issuer || !config.audience || !Number.isSafeInteger(tolerance) || tolerance < 0 || tolerance > 120)
    throw new Error("Invalid bearer authentication configuration");

  return async (request: Request): Promise<OperationsPrincipal | null> => {
    const header = request.headers.get("authorization");
    if (!header || !/^Bearer [A-Za-z0-9._~-]{20,8192}$/.test(header)) return null;
    let claims: unknown;
    try { claims = await verifier.verify(header.slice(7)); } catch { return null; }
    if (!isRecord(claims)) return null;
    const { sub, iss, aud, exp, nbf, role } = claims;
    const now = nowSeconds();
    const audiences = typeof aud === "string" ? [aud] : Array.isArray(aud) ? aud : [];
    if (typeof sub !== "string" || sub.length < 1 || sub.length > 128 ||
        iss !== config.issuer || !audiences.includes(config.audience) ||
        typeof exp !== "number" || !Number.isFinite(exp) || exp <= now - tolerance ||
        (nbf !== undefined && (typeof nbf !== "number" || !Number.isFinite(nbf) || nbf > now + tolerance)) ||
        typeof role !== "string" || !ROLES.has(role)) return null;
    return { actorId: sub, role: role as OperationsPrincipal["role"] };
  };
}
