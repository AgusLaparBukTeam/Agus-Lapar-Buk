import { backendFailure, backendFetch, passthrough } from "@/lib/backend-proxy";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const upstream = await backendFetch(
      "/api/auth/password",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: await request.text(),
      },
      request.headers.get("cookie"),
    );
    return passthrough(upstream);
  } catch (error) {
    return backendFailure(error);
  }
}
