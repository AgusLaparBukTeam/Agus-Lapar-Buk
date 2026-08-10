"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { fetchMe } from "@/lib/api";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const query = useQuery({ queryKey: ["auth", "me"], queryFn: fetchMe, retry: false });
  const mustChangePassword = query.data?.must_change_password;

  useEffect(() => {
    if (query.isError) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (mustChangePassword && pathname !== "/change-password") router.replace(`/change-password?next=${encodeURIComponent(pathname)}`);
  }, [mustChangePassword, query.isError, pathname, router]);

  if (query.isPending || query.isError || !query.data) {
    return <main className="grid min-h-screen place-items-center text-sm text-[var(--subtle)]">Memuat sesi GateGuard…</main>;
  }
  return <>{children}</>;
}
