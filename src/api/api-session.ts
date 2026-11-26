export interface ApiSessionOptions {
  readonly baseUrl: string;
  readonly getAccessToken: () => Promise<string | null>;
  readonly fetchImpl?: typeof fetch;
}

export class ApiSessionError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) {
    super(code);
    this.name = "ApiSessionError";
    this.status = status;
    this.code = code;
  }
}

/** A short-lived authenticated API session. Token storage/refresh stays with the platform identity SDK. */
export function createApiSession(options: ApiSessionOptions) {
  const base = new URL(options.baseUrl);
  if (base.protocol !== "https:" && base.hostname !== "localhost" && base.hostname !== "127.0.0.1")
    throw new Error("RUNNER API sessions require HTTPS");
  const fetcher = options.fetchImpl ?? fetch;

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!path.startsWith("/v1/") || path.startsWith("//")) throw new Error("API path must be an absolute v1 route");
    const url = new URL(path, base);
    if (url.origin !== base.origin) throw new Error("API path escaped configured origin");
    const accessToken = await options.getAccessToken();
    if (!accessToken || accessToken.length > 8192) throw new ApiSessionError(401, "UNAUTHENTICATED");
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${accessToken}`);
    headers.set("accept", "application/json");
    if (init.body !== undefined && !headers.has("content-type")) headers.set("content-type", "application/json");
    headers.set("cache-control", "no-store");
    const response = await fetcher(url, { ...init, headers, cache: "no-store" });
    if (!response.ok) {
      let code = "API_ERROR";
      try {
        const payload = await response.json() as { error?: unknown };
        if (typeof payload.error === "string") code = payload.error;
      } catch { /* retain generic error code */ }
      throw new ApiSessionError(response.status, code);
    }
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  }

  return {
    get: <T>(path: string) => request<T>(path, { method: "GET" }),
    post: <T>(path: string, body: unknown) => request<T>(path, {
      method: "POST", body: JSON.stringify(body),
    }),
  };
}
