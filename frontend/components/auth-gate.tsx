"use client";

import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { fetchMe } from "@/lib/api";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const query = useQuery({ queryKey: ["auth", "me"], queryFn: fetchMe, retry: false });

  useEffect(() => {
    if (query.isError) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [query.isError, pathname, router]);

  if (query.isPending || query.isError || !query.data) {
    return <main className="grid min-h-screen place-items-center text-sm text-[var(--subtle)]">Memuat sesi GateGuard…</main>;
  }
  return <>{children}</>;
}
