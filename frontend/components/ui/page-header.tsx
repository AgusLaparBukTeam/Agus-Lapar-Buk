import type { Icon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

export function PageHeader({ icon: IconComponent, title, description, actions }: { icon?: Icon; title: string; description: string; actions?: ReactNode }) {
  return <header className="page-header"><div className="page-header__copy">{IconComponent && <span className="page-header__icon"><IconComponent size={20} /></span>}<div><h1>{title}</h1><p>{description}</p></div></div>{actions && <div className="page-header__actions">{actions}</div>}</header>;
}
