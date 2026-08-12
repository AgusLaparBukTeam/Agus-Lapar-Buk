"use client";

import { EyeIcon as Eye, EyeSlashIcon as EyeSlash } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@cloudflare/kumo/components/checkbox";
import { fetchMe, login } from "@/lib/api";

function GateLogo() {
  return <div className="gate-logo" aria-label="GateGuard"><span className="gate-logo__word">GateGuard</span></div>;
}

export default function LoginPage() {
  const router = useRouter();
  const [nextPath] = useState(() => {
    if (typeof window === "undefined") return "/dashboard";
    const next = new URLSearchParams(window.location.search).get("next");
    return next?.startsWith("/") ? next : "/dashboard";
  });
  const session = useQuery({ queryKey: ["auth", "me"], queryFn: fetchMe, retry: false });
  const [email, setEmail] = useState(() => typeof window === "undefined" ? "" : window.localStorage.getItem("gateguard.login.email") || "");
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
      const user = await login(email, password);
      if (remember) window.localStorage.setItem("gateguard.login.email", email);
      else window.localStorage.removeItem("gateguard.login.email");
      router.replace(user.must_change_password ? `/change-password?next=${encodeURIComponent(nextPath)}` : nextPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We could not sign you in.");
    } finally {
      setPending(false);
    }
  }

  return <main className="auth-page">
    <section className="auth-form-pane" aria-label="GateGuard sign in">
      <header className="auth-header"><GateLogo /></header>
      <div className="auth-form-wrap">
        <h1>Sign in to GateGuard</h1>
        <p className="auth-intro">Review shipment documents, resolve exceptions, and record release decisions.</p>
        <form onSubmit={submit} className="auth-form">
          {error && <div role="alert" className="auth-error">{error}</div>}
          <label className="auth-field"><span>Email</span><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="username" placeholder="name@company.com" required /></label>
          <label className="auth-field"><span>Password</span><div className="auth-password"><input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" required /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeSlash size={18} /> : <Eye size={18} />}</button></div></label>
          <Checkbox className="auth-remember" label="Remember this email on this device" checked={remember} onCheckedChange={(checked) => setRemember(Boolean(checked))} />
          <Button type="submit" variant="primary" className="auth-submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</Button>
        </form>
        <p className="auth-support">Need access? <span>Contact your GateGuard administrator.</span></p>
        <p className="auth-legal">By continuing, you agree to GateGuard&apos;s terms and privacy policy.</p>
      </div>
    </section>
    <section className="auth-promo" aria-label="GateGuard operations message">
      <div className="auth-promo__top"><span className="auth-promo__brand">GateGuard workspace</span></div>
      <div className="pixel-globe" aria-hidden="true" />
      <div className="auth-promo__copy"><div className="auth-promo__eyebrow">Shipment assurance</div><h2>Every release decision, backed by evidence.</h2><p>Bring documents, findings, and approvals into one clear operational record.</p></div>
    </section>
  </main>;
}
