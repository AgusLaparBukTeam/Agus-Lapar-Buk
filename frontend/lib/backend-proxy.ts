const BACKEND_URL = process.env.BACKEND_API_URL || "http://localhost:8000";
const BACKEND_API_KEY = process.env.BACKEND_API_KEY || "";
const BACKEND_TIMEOUT_MS = Number(process.env.BACKEND_TIMEOUT_MS || "60000");

export async function backendFetch(path: string, init?: RequestInit, cookie?: string | null): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (BACKEND_API_KEY) headers.set("X-API-Key", BACKEND_API_KEY);
  if (cookie) headers.set("Cookie", cookie);
  return fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
    signal: init?.signal ?? AbortSignal.timeout(BACKEND_TIMEOUT_MS),
  });
}

export async function passthrough(response: Response): Promise<Response> {
  const body = await response.arrayBuffer();
  const headers = new Headers();
  const contentType = response.headers.get("content-type");
  const requestId = response.headers.get("x-request-id");
  const retryAfter = response.headers.get("retry-after");
  const setCookie = response.headers.get("set-cookie");
  if (contentType) headers.set("content-type", contentType);
  if (requestId) headers.set("x-request-id", requestId);
  if (retryAfter) headers.set("retry-after", retryAfter);
  if (setCookie) headers.set("set-cookie", setCookie);
  headers.set("cache-control", "no-store");
  return new Response(body, { status: response.status, headers });
}

export function backendFailure(error: unknown): Response {
  const timedOut = error instanceof DOMException && error.name === "TimeoutError";
  return Response.json(
    {
      error: {
        code: timedOut ? "BACKEND_TIMEOUT" : "BACKEND_UNAVAILABLE",
        message: timedOut
          ? "Backend processing timed out. Please retry the shipment."
          : "Backend service is temporarily unavailable.",
      },
    },
    { status: timedOut ? 504 : 503, headers: { "cache-control": "no-store" } },
  );
}
