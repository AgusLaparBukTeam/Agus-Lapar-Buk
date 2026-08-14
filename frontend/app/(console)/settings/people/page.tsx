"use client";

import { Dialog, DialogRoot } from "@cloudflare/kumo/components/dialog";
import { Table } from "@cloudflare/kumo/components/table";
import { PlusIcon as Plus, UsersThreeIcon as UsersThree } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { AppSelect } from "@/components/ui/select";
import { Input } from "@cloudflare/kumo/components/input";
import { isAdministrator } from "@/lib/access";
import { createUser, fetchMe, fetchUsers, updateUser } from "@/lib/api";
import { useSettingsCopy } from "@/components/settings/settings-copy";

export default function PeoplePage() {
  const { language, t } = useSettingsCopy();
  const client = useQueryClient();
  const currentUser = useQuery({ queryKey: ["auth", "me"], queryFn: fetchMe, retry: false });
  const canManagePeople = isAdministrator(currentUser.data?.role);
  const result = useQuery({ queryKey: ["users"], queryFn: fetchUsers, enabled: canManagePeople });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ display_name: "", email: "", password: "", role: "operator" });
  const mutation = useMutation({
    mutationFn: () => createUser(form),
    onSuccess: () => {
      setOpen(false);
      setForm({ display_name: "", email: "", password: "", role: "operator" });
      client.invalidateQueries({ queryKey: ["users"] });
    },
  });

  if (currentUser.isPending) return <main className="grid min-h-screen place-items-center text-sm text-[var(--subtle)]">Memuat sesi GateGuard…</main>;
  if (!canManagePeople) return <div role="alert" className="notice notice--danger">{t.administratorsOnly}</div>;

  const users = result.data || [];
  const active = users.filter((item) => item.active);
  const operators = users.filter((item) => item.role === "operator");
  const reviewers = users.filter((item) => item.role === "supervisor");
  const admins = users.filter((item) => item.role === "admin");

  return (
    <div className="operations-page">
      <PageHeader icon={UsersThree} title={t.peopleAndAccess} description={t.peoplePageDescription} actions={<Button icon={Plus} onClick={() => setOpen(true)}>{t.addPerson}</Button>} />
      <section className="metric-grid metric-grid--four" aria-label={t.peopleAndAccess}>
        <div className="metric-cell"><span>{t.activeUsers}</span><strong>{active.length}</strong><small>{t.canSignInNow}</small></div>
        <div className="metric-cell"><span>{t.operators}</span><strong>{operators.length}</strong><small>{t.prepareShipmentWork}</small></div>
        <div className="metric-cell"><span>{t.reviewers}</span><strong>{reviewers.length}</strong><small>{t.reviewAndDecide}</small></div>
        <div className="metric-cell"><span>{t.administrators}</span><strong>{admins.length}</strong><small>{t.manageWorkspaceAccess}</small></div>
      </section>
      <section className="data-panel data-panel--wide" aria-labelledby="workspace-people-title">
        <div className="data-panel__header"><div><h2 id="workspace-people-title">{t.workspacePeople}</h2><p>{t.accessChangesLogged}</p></div></div>
        <div className="table-scroll">
          <Table>
            <Table.Header sticky><Table.Row><Table.Head>{t.person}</Table.Head><Table.Head>{t.role}</Table.Head><Table.Head>{t.status}</Table.Head><Table.Head>{t.lastLogin}</Table.Head><Table.Head>{t.action}</Table.Head></Table.Row></Table.Header>
            <Table.Body>{users.map((item) => (
              <Table.Row key={item.id}>
                <Table.Cell><span className="table-cell-primary">{item.display_name}</span><small>{item.email}</small></Table.Cell>
                <Table.Cell>{item.role === "supervisor" ? "Reviewer" : item.role === "admin" ? "Administrator" : "Operator"}</Table.Cell>
                <Table.Cell>{item.active ? t.active : t.disabled}</Table.Cell>
                <Table.Cell>{item.last_login_at ? new Date(item.last_login_at).toLocaleString(language === "id" ? "id-ID" : "en-GB") : t.never}</Table.Cell>
                <Table.Cell><Button size="sm" variant="secondary" disabled={item.role === "admin" && admins.length === 1} onClick={() => updateUser(item.id, { active: !item.active }).then(() => client.invalidateQueries({ queryKey: ["users"] }))}>{item.active ? t.deactivate : t.reactivate}</Button></Table.Cell>
              </Table.Row>
            ))}</Table.Body>
          </Table>
        </div>
        {!users.length && <div className="empty-state"><span className="empty-state__title">{t.noPeopleYet}</span><span>{t.addOperatorReviewer}</span></div>}
      </section>
      <DialogRoot open={open} onOpenChange={setOpen}>
        <Dialog className="person-dialog">
          <Dialog.Title>{t.addPersonTitle}</Dialog.Title>
          <Dialog.Description>{t.addPersonDescription}</Dialog.Description>
          <form className="dialog-form" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
            <Input label={t.displayName} required value={form.display_name} onChange={(event) => setForm({ ...form, display_name: event.target.value })} />
            <Input label="Email" required type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            <Input label={t.temporaryPassword} required minLength={12} type="password" autoComplete="new-password" description={t.temporaryPasswordHint} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
            <label>{t.role}<AppSelect ariaLabel={t.role} value={form.role} onValueChange={(role) => setForm({ ...form, role })} options={[{ value: "operator", label: "Operator" }, { value: "supervisor", label: "Reviewer" }]} /></label>
            {mutation.isError && <p role="alert" className="form-error">{(mutation.error as Error).message}</p>}
            <div className="form-panel__actions"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>{t.cancel}</Button><Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? t.adding : t.addPerson}</Button></div>
          </form>
        </Dialog>
      </DialogRoot>
    </div>
  );
}
