"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import PropTypes from "prop-types";
import { createPortal } from "react-dom";
import { cn } from "@/shared/utils/cn";

/** Panel width on a desktop; capped so a phone keeps a thumb-width margin. */
const WIDTH = 340;
const MARGIN = 8;
/** Smallest usable panel before the scroll region takes over. */
const MIN_HEIGHT = 160;

/**
 * Dropdown shell for a header icon: a panel positioned against its trigger, a
 * transparent full-viewport backdrop that closes it on click, and
 * Escape-to-close.
 *
 * The panel is portalled to document.body and measured from the trigger's
 * viewport rectangle instead of being an `absolute` child of the button. The
 * header sits inside `flex h-screen overflow-hidden` (DashboardLayout), so an
 * in-flow dropdown that grew past the header box was clipped by that
 * container; measured viewport coordinates cannot be. `left` is clamped into
 * the viewport, `maxHeight` is whatever room is left below the header, and a
 * scroll or resize re-measures, so the panel follows its trigger instead of
 * drifting from it.
 *
 * The backdrop is transparent and does not dim the page: a notification
 * panel is not a modal, and a scrim would claim a blocking focus it does not
 * have. It exists to catch the dismissing click and to stop that click from
 * reaching the page underneath - one listener doing the work of a backdrop
 * and a document-level outside-click handler.
 */
export default function BellMenu({ open, onClose, triggerRef, label, header, children }) {
  const [pos, setPos] = useState(null);

  const place = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(WIDTH, window.innerWidth - MARGIN * 2);
    const left = Math.min(
      Math.max(MARGIN, rect.right - width),
      Math.max(MARGIN, window.innerWidth - width - MARGIN)
    );
    const top = rect.bottom + MARGIN;
    // Whatever room the viewport has left below the header, with a floor so a
    // landscape phone still shows a usable slice instead of one row.
    const maxHeight = Math.max(MIN_HEIGHT, window.innerHeight - top - MARGIN);
    setPos({ left, top, width, maxHeight });
  }, [triggerRef]);

  useLayoutEffect(() => {
    if (open) place();
    else setPos(null);
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;
    const onChange = () => place();
    window.addEventListener("resize", onChange);
    // Capture phase: the page scrolls inside its own container, so a plain
    // window listener never sees it and the panel stayed behind.
    window.addEventListener("scroll", onChange, true);
    // Capture again, and stop propagation: LongTaskBanner cancels the running
    // task on Escape while its overlay is up, and a document-level listener
    // would fire on the same keypress. The first Escape closes the menu; the
    // banner keeps its own key for the next one.
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, onClose, place]);

  if (!open || !pos || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-label={label}
        className={cn(
          "fixed z-50 flex flex-col overflow-hidden slide-in-top",
          "rounded-xl border border-border-subtle bg-surface shadow-[var(--shadow-elev)]"
        )}
        style={{ left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxHeight }}
      >
        {header ? <div className="shrink-0">{header}</div> : null}
        <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">{children}</div>
      </div>
    </>,
    document.body
  );
}

BellMenu.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  /** The trigger whose rectangle the panel is measured against. */
  triggerRef: PropTypes.shape({ current: PropTypes.any }).isRequired,
  label: PropTypes.string,
  header: PropTypes.node,
  children: PropTypes.node,
};
