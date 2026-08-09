import { backendFailure, backendFetch, passthrough } from "@/lib/backend-proxy";
export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try { return passthrough(await backendFetch(`/api/users/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: await request.text() }, request.headers.get("cookie"))); }
  catch (error) { return backendFailure(error); }
}
