"use client";

import { ShieldCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { login, fetchMe } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [nextPath] = useState(() => {
    if (typeof window === "undefined") return "/dashboard";
    const next = new URLSearchParams(window.location.search).get("next");
    return next?.startsWith("/") ? next : "/dashboard";
  });
  const session = useQuery({ queryKey: ["auth", "me"], queryFn: fetchMe, retry: false });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => { if (session.data) router.replace(nextPath); }, [nextPath, router, session.data]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setPending(true);
    try { await login(email, password); router.replace(nextPath); }
    catch (err) { setError(err instanceof Error ? err.message : "Tidak dapat masuk."); }
    finally { setPending(false); }
  }

  return <main className="grid min-h-screen bg-[#f4f6f8] lg:grid-cols-[1.1fr_0.9fr]">
    <section className="hidden bg-[#102338] p-12 text-white lg:flex lg:flex-col lg:justify-between"><div><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-md bg-[#e5b95c] text-[#102338]"><ShieldCheck /></span><span className="text-lg font-semibold">GateGuard</span></div><div className="mt-24 max-w-lg"><p className="text-xs uppercase tracking-[0.22em] text-[#e5b95c]">Pre-dispatch control</p><h1 className="mt-4 text-4xl font-semibold leading-tight">Make every shipment decision traceable.</h1><p className="mt-5 max-w-md text-sm leading-6 text-white/65">Reconcile delivery documents, investigate exceptions, and keep operational overrides attributable.</p></div></div><p className="text-xs text-white/45">Internal use only · GateGuard Operations</p></section>
    <section className="flex items-center justify-center p-6"><form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-white p-7 shadow-sm"><div className="mb-8 flex items-center gap-3 lg:hidden"><span className="grid h-9 w-9 place-items-center rounded-md bg-[var(--accent)] text-white"><ShieldCheck size={18} /></span><span className="font-semibold">GateGuard</span></div><h2 className="text-xl font-semibold">Masuk ke console</h2><p className="mt-1 text-sm text-[var(--subtle)]">Gunakan akun operasional Anda.</p>{error && <div role="alert" className="mt-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}<label className="mt-6 block text-sm font-medium">Email<input className="mt-2 h-11 w-full rounded-md border border-[var(--border)] px-3" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></label><label className="mt-4 block text-sm font-medium">Password<input className="mt-2 h-11 w-full rounded-md border border-[var(--border)] px-3" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label><button className="mt-6 h-11 w-full rounded-md bg-[var(--accent)] font-medium text-white disabled:opacity-60" disabled={pending}>{pending ? "Memeriksa…" : "Masuk"}</button></form></section>
  </main>;
}
