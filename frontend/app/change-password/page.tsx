"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@cloudflare/kumo/components/input";
import { changePassword, fetchMe } from "@/lib/api";

export default function ChangePasswordPage() {
  const router = useRouter();
  const client = useQueryClient();
  const me = useQuery({ queryKey: ["auth", "me"], queryFn: fetchMe, retry: false });
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (me.isError) router.replace("/login"); }, [me.isError, router]);
  async function submit(event: React.FormEvent) { event.preventDefault(); setError(""); if (newPassword !== confirmPassword) { setError("Passwords do not match."); return; } try { const user = await changePassword(currentPassword, newPassword); client.setQueryData(["auth", "me"], user); setSaved(true); const next = new URLSearchParams(window.location.search).get("next"); window.setTimeout(() => router.replace(next?.startsWith("/") ? next : "/dashboard"), 500); } catch (err) { setError(err instanceof Error ? err.message : "Password could not be changed."); } }
  return <main className="auth-page auth-page--single"><section className="auth-form-pane"><div className="auth-form-wrap"><h1>Set a new password</h1><p className="auth-intro">For your protection, choose a new password before continuing to the workspace.</p><form className="auth-form" onSubmit={submit}><Input label="Current password" required type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /><Input label="New password" required minLength={12} type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} description="Use at least 12 characters." /><Input label="Confirm new password" required minLength={12} type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />{error && <div role="alert" className="auth-error">{error}</div>}{saved && <div role="status" className="notice">Password updated. Taking you to the workspace...</div>}<Button type="submit" variant="primary" disabled={saved}>Continue</Button></form></div></section></main>;
}
