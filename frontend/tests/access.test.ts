import { describe, expect, it } from "vitest";
import { hasMinimumRole, isAdministrator } from "@/lib/access";

describe("role access helpers", () => {
  it("only treats administrators as eligible to manage people", () => {
    expect(isAdministrator("admin")).toBe(true);
    expect(isAdministrator("supervisor")).toBe(false);
    expect(isAdministrator("operator")).toBe(false);
    expect(isAdministrator(undefined)).toBe(false);
  });

  it("preserves the role hierarchy used by navigation and page guards", () => {
    expect(hasMinimumRole("admin", "admin")).toBe(true);
    expect(hasMinimumRole("admin", "supervisor")).toBe(true);
    expect(hasMinimumRole("supervisor", "operator")).toBe(true);
    expect(hasMinimumRole("operator", "supervisor")).toBe(false);
  });
});
