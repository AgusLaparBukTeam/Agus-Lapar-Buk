import { backendFailure, backendFetch, passthrough } from "@/lib/backend-proxy";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).search;
    return passthrough(await backendFetch(`/api/work-queue${query}`, undefined, request.headers.get("cookie")));
  } catch (error) {
    return backendFailure(error);
  }
}
