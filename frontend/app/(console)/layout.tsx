import { AuthGate } from "@/components/auth-gate";
import { AppShell } from "@/components/app-shell/app-shell";

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate><AppShell>{children}</AppShell></AuthGate>;
}
