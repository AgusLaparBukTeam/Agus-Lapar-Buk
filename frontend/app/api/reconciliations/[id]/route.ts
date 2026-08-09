import { backendFailure, backendFetch, passthrough } from "@/lib/backend-proxy";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try { return passthrough(await backendFetch(`/api/reconciliations/${encodeURIComponent(id)}`, undefined, request.headers.get("cookie"))); }
  catch (error) { return backendFailure(error); }
}
