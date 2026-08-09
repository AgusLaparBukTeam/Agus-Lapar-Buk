"use client";

import { Apple, ArrowUpRight, Chrome, Eye, EyeOff, Github, Globe2, LockKeyhole, ShieldCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { fetchMe, login } from "@/lib/api";

function GateLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`gate-logo ${compact ? "gate-logo--compact" : ""}`} aria-label="GateGuard">
      <span className="gate-logo__mark"><ShieldCheck size={compact ? 17 : 20} strokeWidth={2.5} /></span>
      {!compact && <span className="gate-logo__word">GateGuard</span>}
    </div>
  );
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

  useEffect(() => {
    if (session.data) router.replace(nextPath);
  }, [nextPath, router, session.data]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      await login(email, password);
      router.replace(nextPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tidak dapat masuk ke GateGuard.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-form-pane" aria-label="GateGuard sign in">
        <header className="auth-header">
          <GateLogo />
          <span className="auth-header__secure"><LockKeyhole size={14} /> Secure access</span>
        </header>

        <div className="auth-form-wrap">
          <div className="auth-kicker">Operations console · 01</div>
          <h1>Sign in to GateGuard</h1>
          <p className="auth-intro">Keep every shipment decision accountable from one secure workspace.</p>

          <div className="auth-provider-grid" aria-label="Other sign-in methods">
            <Button type="button" variant="secondary" className="auth-provider" disabled title="OAuth belum dikonfigurasi"><Chrome size={17} /> Google</Button>
            <Button type="button" variant="secondary" className="auth-provider" disabled title="OAuth belum dikonfigurasi"><Apple size={17} /> Apple</Button>
            <Button type="button" variant="secondary" className="auth-provider" disabled title="OAuth belum dikonfigurasi"><Github size={17} /> GitHub</Button>
          </div>
          <Button type="button" variant="secondary" className="auth-sso" disabled title="SSO belum dikonfigurasi"><LockKeyhole size={16} /> Continue with SSO</Button>

          <div className="auth-divider"><span>or continue with email</span></div>

          <form onSubmit={submit} className="auth-form">
            {error && <div role="alert" className="auth-error">{error}</div>}

            <label className="auth-field">
              <span>Email</span>
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="username" placeholder="name@company.com" required />
            </label>

            <label className="auth-field">
              <span>Password</span>
              <div className="auth-password">
                <input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" required />
                <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

            <label className="auth-remember">
              <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
              <span>Save email and login method on this device</span>
            </label>

            <Button type="submit" className="auth-submit" disabled={pending}>
              {pending ? "Checking access…" : "Sign in"}
              {!pending && <ArrowUpRight size={17} />}
            </Button>
          </form>

          <p className="auth-support">Need access? <span>Contact your GateGuard administrator.</span></p>
          <p className="auth-legal">By continuing, you agree to GateGuard&apos;s <a href="#terms">terms</a>, <a href="#privacy">privacy policy</a>, and <a href="#cookies">cookie policy</a>.</p>
        </div>
      </section>

      <section className="auth-promo" aria-label="GateGuard operations message">
        <div className="auth-promo__top"><GateLogo compact /><div className="auth-promo__meta"><span><Globe2 size={14} /> English</span><span className="auth-promo__dot" /> Internal workspace</div></div>
        <div className="pixel-globe" aria-hidden="true" />
        <div className="auth-promo__copy">
          <div className="auth-promo__eyebrow">GateGuard operations · 2026</div>
          <h2>Where every shipment decision stays visible.</h2>
          <p>Reconcile documents, investigate exceptions, and move with evidence you can trust.</p>
          <div className="auth-promo__status"><span className="status-pulse" /> Secure by default <span>·</span> audit-ready</div>
        </div>
        <div className="auth-promo__pages"><span className="active" /><span /><span /></div>
      </section>
    </main>
  );
}
