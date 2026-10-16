"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/shared/utils/cn";

// Signature detail: the selection is shown by one indicator element that
// physically slides to the newly selected option, instead of two options
// swapping colour. The eye follows a single object and can tell which way the
// selection moved. This is the one deliberate motion in the chrome; everything
// else only fades or settles.
//
// The indicator is measured (offsetLeft/offsetTop/offsetWidth), not
// index-derived, so it lands under the right option when labels differ in
// width and also tracks the second row if the options wrap. Measurement runs
// in useLayoutEffect, before paint, so first render never shows the indicator
// at the wrong slot.
export default function SegmentedControl({
  options = [],
  value,
  onChange,
  size = "md",
  label,
  className,
}) {
  const sizes = {
    sm: "h-7 text-xs",
    md: "h-9 text-sm",
    lg: "h-11 text-base",
  };

  const trackRef = useRef(null);
  const [indicator, setIndicator] = useState(null);

  const measure = () => {
    const track = trackRef.current;
    if (!track) return;
    const el = [...track.querySelectorAll("[data-segment-option]")].find(
      (node) => node.dataset.segmentValue === String(value)
    );
    if (!el) {
      setIndicator(null);
      return;
    }
    setIndicator({
      left: el.offsetLeft,
      top: el.offsetTop,
      width: el.offsetWidth,
      height: el.offsetHeight,
    });
  };

  useLayoutEffect(() => {
    measure();
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => measure());
    ro.observe(track);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, value, size]);

  return (
    <div
      ref={trackRef}
      role="tablist"
      aria-label={label}
      className={cn(
        // Wrap rather than scroll. A horizontal scrollbar hides options behind
        // it, and a tab you cannot see is a tab that does not exist.
        "relative inline-flex flex-wrap items-center p-1 rounded-[var(--r-control)]",
        "bg-surface-2",
        className
      )}
    >
      {/* The moving pill: tier-2 elevation with the hairline, so it reads as a
          raised thumb on the track rather than as paint. aria-hidden because
          the options themselves carry the semantics. */}
      {indicator && (
        <span
          aria-hidden="true"
          className="chrome-segment-indicator pointer-events-none absolute rounded-[var(--r-chip)] bg-surface shadow-[var(--elev-2)]"
          style={{
            left: indicator.left,
            top: indicator.top,
            width: indicator.width,
            height: indicator.height,
          }}
        />
      )}
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            data-segment-option
            data-segment-value={option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "chrome-focus relative z-10 shrink-0 px-4 rounded-[var(--r-chip)] font-medium transition-colors duration-[var(--motion-fast)]",
              sizes[size] ?? sizes.md,
              selected
                ? "text-text-main"
                : "text-text-muted chrome-row hover:text-text-main"
            )}
          >
            {option.icon && (
              <span className="material-symbols-outlined text-[16px] mr-1.5">
                {option.icon}
              </span>
            )}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
