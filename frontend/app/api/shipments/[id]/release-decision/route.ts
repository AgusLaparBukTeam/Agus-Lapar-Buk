import { backendFailure, backendFetch, passthrough } from "@/lib/backend-proxy";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return passthrough(await backendFetch(`/api/shipments/${encodeURIComponent(id)}/release-decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: await request.text() }, request.headers.get("cookie")));
  } catch (error) {
    return backendFailure(error);
  }
}
