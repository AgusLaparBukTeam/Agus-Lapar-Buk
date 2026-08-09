import { backendFailure, backendFetch, passthrough } from "@/lib/backend-proxy";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_REQUEST_BYTES = 32 * 1024 * 1024;
const EXPECTED_FIELDS = ["delivery_order", "invoice", "packing_list"] as const;

function error(message: string, status = 422) {
  return Response.json({ error: { code: "INVALID_UPLOAD", message } }, { status });
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.startsWith("multipart/form-data")) {
    return error("Expected multipart form data.", 415);
  }

  const rawLength = request.headers.get("content-length");
  const contentLength = rawLength ? Number(rawLength) : null;
  if (contentLength !== null && (!Number.isFinite(contentLength) || contentLength < 0)) {
    return error("Invalid Content-Length.", 400);
  }
  if (contentLength !== null && contentLength > MAX_REQUEST_BYTES) {
    return error("Upload request is too large.", 413);
  }

  try {
    const form = await request.formData();
    for (const name of EXPECTED_FIELDS) {
      const value = form.get(name);
      if (!(value instanceof File)) return error(`Missing required file: ${name}.`);
      if (value.size === 0) return error(`${name} is empty.`);
      if (value.size > MAX_FILE_BYTES) return error(`${name} exceeds the 10 MB limit.`, 413);
    }

    const upstream = await backendFetch("/api/reconcile", {
      method: "POST",
      body: form,
    }, request.headers.get("cookie"));
    return passthrough(upstream);
  } catch (err) {
    return backendFailure(err);
  }
}
