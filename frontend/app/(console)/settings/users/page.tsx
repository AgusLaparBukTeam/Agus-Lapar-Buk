import { redirect } from "next/navigation";

/**
 * Kept only for legacy bookmarks. People management has one canonical Kumo-based surface.
 */
export default function LegacyUsersPage() {
  redirect("/settings/people");
}
