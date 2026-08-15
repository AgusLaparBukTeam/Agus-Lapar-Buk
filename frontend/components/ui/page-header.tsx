import type { Icon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

export function PageHeader({ icon: IconComponent, title, description, actions }: { icon?: Icon; title: string; description?: string; actions?: ReactNode }) {
  return <header className="cf-page-header page-header"><div className="cf-page-header__copy">{IconComponent && <span className="cf-page-header__icon" aria-hidden="true"><IconComponent size={16} /></span>}<div><h1 className="cf-page-title">{title}</h1>{description && <p className="cf-page-header__description">{description}</p>}</div></div>{actions && <div className="cf-page-header__actions">{actions}</div>}</header>;
}
