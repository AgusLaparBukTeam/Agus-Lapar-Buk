"use client";

import { ArrowUpRight, Eye, EyeSlash, Globe, LockKey, ShieldCheck } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { fetchMe, login } from "@/lib/api";

function GateLogo({ compact = false }: { compact?: boolean }) {
  return <div className={`gate-logo ${compact ? "gate-logo--compact" : ""}`} aria-label="GateGuard">
    <span className="gate-logo__mark"><ShieldCheck size={compact ? 17 : 20} weight="bold" /></span>
    {!compact && <span className="gate-logo__word">GateGuard</span>}
  </div>;
}

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
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => { if (session.data) router.replace(nextPath); }, [nextPath, router, session.data]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      await login(email, password);
      if (remember) window.localStorage.setItem("gateguard.login.email", email);
      router.replace(nextPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tidak dapat masuk ke GateGuard.");
    } finally {
      setPending(false);
    }
  }

  return <main className="auth-page">
    <section className="auth-form-pane" aria-label="GateGuard sign in">
      <header className="auth-header"><GateLogo /><span className="auth-header__secure"><LockKey size={14} /> Secure access</span></header>
      <div className="auth-form-wrap">
        <div className="auth-kicker">Shipment assurance</div>
        <h1>Sign in to GateGuard</h1>
        <p className="auth-intro">Review shipment documents, resolve exceptions, and make release decisions with a clear record of evidence.</p>
        <form onSubmit={submit} className="auth-form">
          {error && <div role="alert" className="auth-error">{error}</div>}
          <label className="auth-field"><span>Email</span><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="username" placeholder="name@company.com" required /></label>
          <label className="auth-field"><span>Password</span><div className="auth-password"><input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" required /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}</button></div></label>
          <label className="auth-remember"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /><span>Remember this email on this device</span></label>
          <Button type="submit" className="auth-submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}{!pending && <ArrowUpRight size={17} />}</Button>
        </form>
        <p className="auth-support">Need access? <span>Contact your GateGuard administrator.</span></p>
        <p className="auth-legal">By continuing, you agree to GateGuard&apos;s <a href="#terms">terms</a>, <a href="#privacy">privacy policy</a>, and <a href="#cookies">cookie policy</a>.</p>
      </div>
    </section>
    <section className="auth-promo" aria-label="GateGuard operations message">
      <div className="auth-promo__top"><GateLogo compact /><div className="auth-promo__meta"><span><Globe size={14} /> English</span><span className="auth-promo__dot" /> Secure workspace</div></div>
      <div className="pixel-globe" aria-hidden="true" />
      <div className="auth-promo__copy"><div className="auth-promo__eyebrow">GateGuard shipment assurance</div><h2>Keep every shipment decision visible.</h2><p>Bring documents, findings, and release decisions into one clear operational record.</p><div className="auth-promo__status"><span className="status-pulse" /> Evidence-led decisions <span>·</span> built for teams</div></div>
      <div className="auth-promo__pages"><span className="active" /><span /><span /></div>
    </section>
  </main>;
}
