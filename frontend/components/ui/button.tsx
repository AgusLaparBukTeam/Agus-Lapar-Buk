import { Button as KumoButton } from "@cloudflare/kumo/components/button";
import type { ComponentProps } from "react";

type KumoButtonProps = ComponentProps<typeof KumoButton>;
type Variant = "primary" | "secondary" | "danger" | "ghost";

export function Button({ variant = "primary", ...props }: Omit<KumoButtonProps, "variant"> & { variant?: Variant }) {
  const kumoVariant = variant === "danger" ? "destructive" : variant;
  const kumoProps = { ...props, variant: kumoVariant } as KumoButtonProps;
  return <KumoButton {...kumoProps} />;
}
