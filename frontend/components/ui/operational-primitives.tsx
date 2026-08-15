import { Badge } from "@cloudflare/kumo/components/badge";
import type { ReactNode } from "react";

function join(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function tone(value: string) {
  const normalized = value.toLowerCase();
  if (/(hold|failed|error|invalidated|critical|high)/.test(normalized)) return "error" as const;
  if (/(review|pending|proposed|medium|not_configured|warning)/.test(normalized)) return "warning" as const;
  if (/(clear|authorized|complete|success|low|resolved)/.test(normalized)) return "success" as const;
  return "neutral" as const;
}

export function OperationalState({ value, className }: { value: string | null | undefined; className?: string }) {
  const label = value || "—";
  return <Badge appearance="dot" variant={tone(label)} className={className}>{label}</Badge>;
}

export function StateNotice({ title, children, tone: noticeTone = "info", action }: {
  title: ReactNode;
  children: ReactNode;
  tone?: "info" | "warning" | "danger";
  action?: ReactNode;
}) {
  return <section className={join("cf-state-notice", `cf-state-notice--${noticeTone}`)} role={noticeTone === "danger" ? "alert" : "status"}>
    <div><p className="cf-state-notice__title">{title}</p><p className="cf-state-notice__copy">{children}</p></div>
    {action && <div className="cf-state-notice__action">{action}</div>}
  </section>;
}

export function ContextRail({ children, className, title }: { children: ReactNode; className?: string; title?: ReactNode }) {
  return <aside className={join("cf-context-rail", className)} aria-label={typeof title === "string" ? title : "Konteks pengiriman"}>
    {title && <h2 className="cf-context-rail__title">{title}</h2>}
    {children}
  </aside>;
}

export function RailSection({ title, children }: { title: ReactNode; children: ReactNode }) {
  return <section className="cf-context-rail__section"><h3>{title}</h3>{children}</section>;
}

export function KeyValueList({ items }: { items: Array<{ label: ReactNode; value: ReactNode }> }) {
  return <dl className="cf-key-value-list">{items.map((item, index) => <div key={index}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>;
}

export function LifecycleTrack({ steps }: { steps: Array<{ label: string; detail?: ReactNode; state: "complete" | "current" | "blocked" | "future" }> }) {
  return <ol className="cf-lifecycle-track">{steps.map((step) => <li className={`cf-lifecycle-track__step cf-lifecycle-track__step--${step.state}`} key={step.label}>
    <span className="cf-lifecycle-track__marker" aria-hidden />
    <div><p>{step.label}</p>{step.detail && <small>{step.detail}</small>}</div>
  </li>)}</ol>;
}

export function MetricCell({ label, value, detail }: { label: ReactNode; value: ReactNode; detail?: ReactNode }) {
  return <div className="cf-metric-cell"><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>;
}
