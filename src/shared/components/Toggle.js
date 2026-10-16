"use client";

import { cn } from "@/shared/utils/cn";

export default function Toggle({
  checked = false,
  onChange,
  label,
  description,
  disabled = false,
  size = "md",
  className,
}) {
  const sizes = {
    sm: { track: "w-8 h-4", thumb: "size-3", translate: "translate-x-4" },
    md: { track: "w-11 h-6", thumb: "size-5", translate: "translate-x-5" },
    lg: { track: "w-14 h-7", thumb: "size-6", translate: "translate-x-7" },
  };

  const handleClick = () => {
    if (!disabled && onChange) onChange(!checked);
  };

  return (
    <div
      className={cn(
        "flex items-center gap-3",
        disabled && "chrome-disabled",
        className
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={typeof label === "string" ? label : undefined}
        disabled={disabled}
        onClick={handleClick}
        className={cn(
          "chrome-focus relative inline-flex shrink-0 rounded-full",
          "transition-colors duration-[var(--motion-fast)] ease-in-out",
          // The gradient is gone: a track is a state indicator, and a flat
          // brand fill reads as "on" at least as clearly without implying the
          // switch has volume. The warm lift goes with it - on a track that is
          // already brand-coloured it only muddies the fill instead of adding
          // a tier, and the elevation ladder is reserved for surfaces. No
          // border either: it would shrink the inner box in the "off" state
          // only and make the thumb step at the moment of the switch, which is
          // a visible jump.
          checked
            ? "bg-brand-500"
            : "bg-surface-3",
          sizes[size]?.track ?? sizes.md.track,
          disabled && "chrome-disabled"
        )}
      >
        <span
          className={cn(
            "pointer-events-none inline-block rounded-full bg-white shadow-sm",
            "transform transition duration-[var(--motion-fast)] ease-in-out",
            checked ? sizes[size]?.translate : "translate-x-0.5",
            sizes[size]?.thumb,
            "mt-0.5"
          )}
        />
      </button>
      {(label || description) && (
        <div className="flex flex-col">
          {label && (
            <span className="text-sm font-medium text-text-main">{label}</span>
          )}
          {description && (
            <span className="text-xs text-text-muted">{description}</span>
          )}
        </div>
      )}
    </div>
  );
}
