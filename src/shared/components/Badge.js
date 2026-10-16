"use client";

import { cn } from "@/shared/utils/cn";

// Radius is the only thing the contract changes here. A badge was a pill
// (rounded-full), which put it in the same shape family as the Toggle track -
// genuinely circular and genuinely interactive. A badge is a label, so it
// takes the chip radius (--r-chip). The variant colours keep their explicit
// dark: pairs: they were already correct on both themes, and swapping them for
// the semantic scale would have dropped the light-mode text contrast
// (green-600 -> --color-success is a 3.4:1 -> 2.6:1 regression on the
// 10%-tinted background).
const variants = {
  default: "bg-surface-2 text-text-muted ring-1 ring-inset ring-border-subtle",
  primary: "bg-brand-500/10 text-brand-600 dark:text-brand-300 ring-1 ring-inset ring-brand-500/20",
  success: "bg-success/10 text-success ring-1 ring-inset ring-success/20",
  warning: "bg-warning/10 text-warning ring-1 ring-inset ring-warning/20",
  error: "bg-danger/10 text-danger ring-1 ring-inset ring-danger/20",
  info: "bg-info/10 text-info ring-1 ring-inset ring-info/20",
};

const sizes = {
  sm: "px-2 py-0.5 text-[10px]",
  md: "px-2.5 py-1 text-xs",
  lg: "px-3 py-1.5 text-sm",
};

export default function Badge({
  children,
  variant = "default",
  size = "md",
  dot = false,
  icon,
  className,
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[var(--r-chip)] font-semibold",
        variants[variant] ?? variants.default,
        sizes[size] ?? sizes.md,
        className
      )}
    >
      {dot && (
        <span
          className={cn(
            "size-1.5 rounded-full",
            variant === "success" && "bg-success",
            variant === "warning" && "bg-warning",
            variant === "error" && "bg-danger",
            variant === "info" && "bg-info",
            variant === "primary" && "bg-brand-500",
            variant === "default" && "bg-text-muted"
          )}
        />
      )}
      {icon && <span className="material-symbols-outlined text-[14px]">{icon}</span>}
      {children}
    </span>
  );
}
