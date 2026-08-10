"use client";

import { UserListIcon as UserList } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { fetchUsers, createUser, updateUser } from "@/lib/api";
import type { UserRole } from "@/lib/types";

export default function UsersPage() {
  const client = useQueryClient();
  const { data, isPending, isError } = useQuery({ queryKey: ["users"], queryFn: fetchUsers });
  const [form, setForm] = useState({ email: "", display_name: "", password: "", role: "operator" as UserRole });
  const mutation = useMutation({ mutationFn: () => createUser(form), onSuccess: () => { setForm({ email: "", display_name: "", password: "", role: "operator" }); client.invalidateQueries({ queryKey: ["users"] }); } });
  const toggle = useMutation({ mutationFn: (value: { id: string; active: boolean }) => updateUser(value.id, { active: value.active }), onSuccess: () => client.invalidateQueries({ queryKey: ["users"] }) });
  if (isPending) return <div className="page-loading">Loading people…</div>;
  if (isError || !data) return <div role="alert" className="notice notice--danger">People and access is only available to administrators.</div>;
  return <div><PageHeader icon={UserList} title="People and access" description="Add teammates and control who can prepare, review, and approve shipment decisions." /><section className="form-panel"><div className="form-panel__heading"><div><h2>Add a person</h2><p>Each person signs in with their own account. Credentials are never shown after creation.</p></div></div><form onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }} className="form-grid"><label>Display name<input required value={form.display_name} onChange={(event) => setForm({ ...form, display_name: event.target.value })} /></label><label>Email<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label>Temporary password<input required minLength={12} type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label><label>Role<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })}><option value="operator">Operator</option><option value="supervisor">Reviewer</option><option value="admin">Administrator</option></select></label><div className="form-panel__actions"><Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Adding…" : "Add person"}</Button></div></form>{mutation.isError && <p role="alert" className="form-error">{(mutation.error as Error).message}</p>}</section><section className="data-panel data-panel--wide"><div className="data-panel__header"><div><h2>Workspace people</h2><p>Access changes are recorded in the activity log.</p></div></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Person</th><th>Role</th><th>Status</th><th>Action</th></tr></thead><tbody>{data.map((user) => <tr key={user.id}><td><strong>{user.display_name}</strong><small>{user.email}</small></td><td>{user.role === "admin" ? "Administrator" : user.role === "supervisor" ? "Reviewer" : "Operator"}</td><td>{user.active ? "Active" : "Inactive"}</td><td><Button variant="secondary" size="sm" onClick={() => toggle.mutate({ id: user.id, active: !user.active })}>{user.active ? "Deactivate" : "Activate"}</Button></td></tr>)}</tbody></table></div></section></div>;
}
