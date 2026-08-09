import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const styles = {
    primary: "bg-[var(--accent)] text-white border-[var(--accent)] hover:brightness-95",
    secondary: "bg-white text-[var(--text)] border-[var(--border)] hover:bg-[var(--muted)]",
    danger: "bg-[var(--danger)] text-white border-[var(--danger)] hover:brightness-95",
    ghost: "bg-transparent text-[var(--text)] border-transparent hover:bg-[var(--muted)]",
  }[variant];
  return (
    <button
      {...props}
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium
      disabled:pointer-events-none disabled:opacity-50 transition ${styles} ${className}`}
    />
  );
}
