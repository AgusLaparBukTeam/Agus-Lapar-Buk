import { LayerCard } from "@cloudflare/kumo/components/layer-card";
import type { ReactNode } from "react";

function join(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function CloudflarePageShell({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={join("cf-page-shell", className)}>{children}</div>;
}

export function FilterBar({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return <div className={join("cf-filter-bar", className)} aria-label={label}>{children}</div>;
}

export function DataTableSurface({ children, className, title, description, actions }: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return <LayerCard className={join("cf-data-surface", className)}>{(title || description || actions) && <div className="cf-data-surface__header"><div>{title && <h2 className="cf-section-title">{title}</h2>}{description && <p className="cf-data-surface__description">{description}</p>}</div>{actions && <div className="cf-data-surface__actions">{actions}</div>}</div>}{children}</LayerCard>;
}

export function MainAsideLayout({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={join("cf-main-aside", className)}>{children}</div>;
}

export function MetricsHeader({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return <section className={join("cf-metric-strip", className)} aria-label={label}>{children}</section>;
}

export function ChartSurface({ children, className, title, description, actions }: {
  children: ReactNode;
  className?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return <DataTableSurface className={join("cf-chart-surface", className)} title={title} description={description} actions={actions}>{children}</DataTableSurface>;
}

export function SettingSection({ children, className, title, description }: {
  children: ReactNode;
  className?: string;
  title: ReactNode;
  description?: ReactNode;
}) {
  return <section className={join("cf-setting-section", className)}><div><h2 className="cf-section-title">{title}</h2>{description && <p className="cf-setting-section__description">{description}</p>}</div><div className="cf-setting-section__content">{children}</div></section>;
}

export function EmptyState({ icon, title, description, action, className }: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return <div className={join("cf-empty-state", className)}>{icon && <div className="cf-empty-state__icon">{icon}</div>}<div className="cf-empty-state__copy"><p className="cf-empty-state__title">{title}</p>{description && <p className="cf-empty-state__description">{description}</p>}</div>{action && <div className="cf-empty-state__action">{action}</div>}</div>;
}
