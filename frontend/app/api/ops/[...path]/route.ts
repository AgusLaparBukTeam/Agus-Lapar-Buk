import { backendFailure, backendFetch, passthrough } from "@/lib/backend-proxy";

export const runtime = "nodejs";

async function proxy(request: Request, method: string) {
  try {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/ops/, "") || "/";
    const body = method === "GET" || method === "DELETE" ? undefined : await request.text();
    const headers = new Headers();
    const contentType = request.headers.get("content-type");
    const organization = request.headers.get("x-gateguard-organization");
    if (contentType) headers.set("Content-Type", contentType);
    if (organization) headers.set("X-GateGuard-Organization", organization);
    return passthrough(await backendFetch(`/api${path}${url.search}`, { method, headers, body }, request.headers.get("cookie")));
  } catch (error) {
    return backendFailure(error);
  }
}

export const GET = (request: Request) => proxy(request, "GET");
export const POST = (request: Request) => proxy(request, "POST");
export const PATCH = (request: Request) => proxy(request, "PATCH");
export const DELETE = (request: Request) => proxy(request, "DELETE");
