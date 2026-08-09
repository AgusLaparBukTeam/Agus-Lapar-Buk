import { backendFailure, backendFetch, passthrough } from "@/lib/backend-proxy";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try { return passthrough(await backendFetch("/api/audit", undefined, request.headers.get("cookie"))); }
  catch (error) { return backendFailure(error); }
}
