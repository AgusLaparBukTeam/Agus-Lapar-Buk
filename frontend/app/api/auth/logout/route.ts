import { backendFailure, backendFetch, passthrough } from "@/lib/backend-proxy";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try { return passthrough(await backendFetch("/api/auth/logout", { method: "POST" }, request.headers.get("cookie"))); }
  catch (error) { return backendFailure(error); }
}
