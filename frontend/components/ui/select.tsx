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
  const emptyOption = options.find((option) => option.value === "");
  const visibleOptions = options.filter((option) => option.value !== "");
  const resolvedPlaceholder = placeholder || emptyOption?.label;

  return (
    <KumoSelect
      aria-label={ariaLabel}
      className={className}
      disabled={disabled}
      onValueChange={(next) => {
        if (typeof next === "string") onValueChange(next);
      }}
      placeholder={resolvedPlaceholder}
      renderValue={(selected) => options.find((option) => option.value === selected)?.label || selected}
      value={value || undefined}
    >
      {visibleOptions.map((option) => (
        <KumoSelect.Option disabled={option.disabled} key={option.value} value={option.value}>
          {option.label}
        </KumoSelect.Option>
      ))}
    </KumoSelect>
  );
}
