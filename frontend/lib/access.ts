import type { UserRole } from "@/lib/types";

const ROLE_LEVEL: Record<UserRole, number> = {
  operator: 1,
  supervisor: 2,
  admin: 3,
};

export function hasMinimumRole(role: UserRole | undefined | null, minimum: UserRole): boolean {
  return role !== undefined && role !== null && ROLE_LEVEL[role] >= ROLE_LEVEL[minimum];
}

export function isAdministrator(role: UserRole | undefined | null): boolean {
  return hasMinimumRole(role, "admin");
}
