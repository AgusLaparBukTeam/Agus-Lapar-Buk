import { describe, expect, it } from "vitest";
import { validateFile } from "@/lib/validation";

describe("validateFile", () => {
  it("accepts supported PDF", () => {
    const file = new File(["%PDF-1.4"], "invoice.pdf", { type: "application/pdf" });
    expect(validateFile(file)).toBeNull();
  });

  it("rejects unsupported extension", () => {
    const file = new File(["x"], "invoice.exe", { type: "application/octet-stream" });
    expect(validateFile(file)).toMatch(/PDF/);
  });
});
