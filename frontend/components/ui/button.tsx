import { Button as KumoButton, LinkButton as KumoLinkButton } from "@cloudflare/kumo/components/button";
import type { ComponentProps } from "react";

type KumoButtonProps = ComponentProps<typeof KumoButton>;
type KumoLinkButtonProps = ComponentProps<typeof KumoLinkButton>;
type Variant = "primary" | "secondary" | "danger" | "ghost" | "link";

export function Button({ variant = "secondary", ...props }: Omit<KumoButtonProps, "variant"> & { variant?: Variant }) {
  const kumoVariant = variant === "danger" ? "destructive" : variant === "link" ? "ghost" : variant;
  const kumoProps = { ...props, variant: kumoVariant } as KumoButtonProps;
  return <KumoButton {...kumoProps} />;
}

export function ActionLink({ variant = "ghost", ...props }: Omit<KumoLinkButtonProps, "variant"> & { variant?: Variant }) {
  const kumoVariant = variant === "danger" ? "destructive" : variant === "link" ? "ghost" : variant;
  return <KumoLinkButton {...props} variant={kumoVariant} />;
}
