import { backendFailure, backendFetch, passthrough } from "@/lib/backend-proxy";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return passthrough(await backendFetch(`/api/shipments/${encodeURIComponent(id)}`, undefined, request.headers.get("cookie")));
  } catch (error) {
    return backendFailure(error);
  }
}
