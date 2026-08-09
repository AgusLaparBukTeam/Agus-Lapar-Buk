import { backendFailure, backendFetch, passthrough } from "@/lib/backend-proxy";

export const runtime = "nodejs";
const MAX_OVERRIDE_BYTES = 24 * 1024;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_OVERRIDE_BYTES) {
    return Response.json(
      { error: { code: "OVERRIDE_TOO_LARGE", message: "Override payload is too large." } },
      { status: 413 },
    );
  }

  try {
    const upstream = await backendFetch(`/api/reconciliations/${encodeURIComponent(id)}/override`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
    }, request.headers.get("cookie"));
    return passthrough(upstream);
  } catch (err) {
    return backendFailure(err);
  }
}
