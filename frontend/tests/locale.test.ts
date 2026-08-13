import { describe, expect, it } from "vitest";
import { terms, translate } from "@/lib/locale";

describe("terminology policy", () => {
  it("uses natural Indonesian for operational navigation", () => {
    expect(translate("id", "shipments")).toBe("Pengiriman");
    expect(translate("id", "workQueue")).toBe("Antrean kerja");
    expect(translate("id", "checkDocuments")).toBe("Periksa dokumen");
  });

  it("keeps familiar technical terms in English", () => {
    expect(terms.id.webhooks).toBe("Webhooks");
    expect(terms.id.observability).toBe("Observability");
    expect(terms.id.english).toBe("English");
  });

  it("provides complete, natural copy for authentication in both locales", () => {
    expect(translate("id", "loginTitle")).toBe("Masuk ke GateGuard");
    expect(translate("id", "signIn")).toBe("Masuk");
    expect(translate("en", "loginTitle")).toBe("Sign in to GateGuard");
    expect(translate("en", "signIn")).toBe("Sign in");
  });

  it("provides an English fallback for every Indonesian UI key", () => {
    expect(Object.keys(terms.en).sort()).toEqual(Object.keys(terms.id).sort());
  });
});
