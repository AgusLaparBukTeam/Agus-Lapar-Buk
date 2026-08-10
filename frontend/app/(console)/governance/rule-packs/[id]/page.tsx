"use client";

import { Table } from "@cloudflare/kumo/components/table";
import { ArrowLeftIcon as ArrowLeft, ListChecksIcon as RulesIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { fetchRulePack, publishRulePack } from "@/lib/api";

export default function RulePackDetailPage() {
  const { id } = useParams<{ id: string }>();
  const client = useQueryClient();
  const result = useQuery({ queryKey: ["rule-pack", id], queryFn: () => fetchRulePack(id) });
  const publish = useMutation({ mutationFn: () => publishRulePack(id), onSuccess: () => client.invalidateQueries({ queryKey: ["rule-pack", id] }) });
  if (result.isPending) return <div className="page-loading">Loading rule pack...</div>;
  if (result.isError || !result.data) return <div role="alert" className="notice notice--danger">This rule pack could not be loaded.</div>;
  const pack = result.data.rule_pack;
  const rules = result.data.rules;
  return <div className="operations-page"><Link className="back-link" href="/governance/rule-packs"><ArrowLeft size={15} /> Back to rule packs</Link><PageHeader icon={RulesIcon} title={String(pack.name)} description={`Version ${String(pack.version)} · ${String(pack.scope)}`} actions={pack.status === "DRAFT" ? <Button disabled={publish.isPending} onClick={() => publish.mutate()}>Publish rule pack</Button> : <span className="table-status">{String(pack.status)}</span>} /><section className="data-panel data-panel--wide"><div className="data-panel__header"><div><h2>Rules in this pack</h2><p>Published packs are immutable and retain the version used by assurance checks.</p></div></div><div className="table-scroll"><Table><Table.Header sticky><Table.Row><Table.Head>Rule</Table.Head><Table.Head>Name</Table.Head><Table.Head>Description</Table.Head><Table.Head>Active</Table.Head></Table.Row></Table.Header><Table.Body>{rules.map((rule) => <Table.Row key={String(rule.id)}><Table.Cell><strong>{String(rule.rule_id)}</strong></Table.Cell><Table.Cell>{String(rule.name)}</Table.Cell><Table.Cell>{String(rule.description)}</Table.Cell><Table.Cell>{rule.active ? "Yes" : "No"}</Table.Cell></Table.Row>)}</Table.Body></Table></div>{!rules.length && <div className="empty-state"><strong>No rules defined</strong><span>Add rule definitions before publishing this pack.</span></div>}{publish.isError && <p className="form-error" role="alert">{(publish.error as Error).message}</p>}</section></div>;
}
