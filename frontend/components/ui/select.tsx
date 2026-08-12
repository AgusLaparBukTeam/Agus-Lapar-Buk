"use client";

import { Select as KumoSelect } from "@cloudflare/kumo/components/select";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type AppSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
};

export function AppSelect({
  value,
  onValueChange,
  options,
  placeholder,
  ariaLabel,
  disabled = false,
  className,
}: AppSelectProps) {
  return (
    <KumoSelect
      aria-label={ariaLabel}
      className={className}
      disabled={disabled}
      onValueChange={(next) => {
        if (typeof next === "string") onValueChange(next);
      }}
      placeholder={placeholder}
      value={value}
    >
      {options.map((option) => (
        <KumoSelect.Option disabled={option.disabled} key={option.value} value={option.value}>
          {option.label}
        </KumoSelect.Option>
      ))}
    </KumoSelect>
  );
}
