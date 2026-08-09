import { backendFailure, backendFetch, passthrough } from "@/lib/backend-proxy";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try { return passthrough(await backendFetch("/api/users", undefined, request.headers.get("cookie"))); }
  catch (error) { return backendFailure(error); }
}
export async function POST(request: Request) {
  try { return passthrough(await backendFetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: await request.text() }, request.headers.get("cookie"))); }
  catch (error) { return backendFailure(error); }
}
