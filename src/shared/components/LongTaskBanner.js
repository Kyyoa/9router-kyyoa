/* eslint-disable react/prop-types */
/**
 * Long-operation card with cancel / run-in-background controls.
 *
 * The previous revision decorated every part of this card: a gradient rail
 * down the left edge, a pulsing ring around a gradient icon tile, a
 * rounded-2xl frame on an elevated shadow and a blurred scrim. Read against
 * the rest of the dashboard it announced itself as decoration rather than as
 * a status readout, which is what "looks generated" means here. Every one of
 * those choices also carried no information: the rail tracked the same
 * percent the bar already showed, and the ring pulsed whether or not the
 * operation was progressing.
 *
 * What is left is a status panel: a flat surface, a 1px border, the operation
 * name, its one line of progress, and a 2px bar pinned to the bottom edge
 * (edge bar rather than a pill inside padding, so the panel keeps a single
 * rectangle instead of a rectangle containing a smaller rounded rectangle).
 * The percent is the only accent, and it is type, not fill.
 *
 * Grounding: the panel is anchored to the bottom-right of the viewport with a
 * fixed offset instead of being centred and floating over the page. A status
 * readout belongs where the eye already goes for transient feedback, and it
 * leaves the centre of the screen free for the work the operator is trying to
 * get back to.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { cn } from "@/shared/utils/cn";

/** Quarter-turn arc. No trail, no glow, no gradient stroke. */
function Ring({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("animate-spin shrink-0", className)}
      fill="none"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.2" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Bottom-edge bar. Determinate when a percent exists, a 40%-wide sweep
 * otherwise, so a caller that reports no progress still shows activity
 * instead of a dead panel.
 */
function ProgressBar({ percent }) {
  return (
    <div className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-border">
      {percent === null ? (
        <div className="progress-indeterminate h-full w-2/5 bg-primary" />
      ) : (
        <div
          className="h-full bg-primary transition-[width] duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      )}
    </div>
  );
}

/**
 * Icon-button. Borderless and compact: the two controls sit inside an already
 * bordered card, so giving each its own 1px frame doubles the chrome for no
 * reason. Tone is text colour only, with a soft hover wash.
 */
function IconButton({ label, glyph, onClick, tone = "default", className, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "flex size-6 items-center justify-center rounded-md transition-colors",
        tone === "danger"
          ? "text-text-muted hover:bg-danger/10 hover:text-danger"
          : "text-text-muted hover:bg-surface-2 hover:text-text-main",
        className
      )}
    >
      {children ?? (
        <span className="material-symbols-outlined text-[16px] leading-none">{glyph}</span>
      )}
    </button>
  );
}

/**
 * The collapsed card. Same information as the full one, smaller, out of the
 * way. Fixed clear of mobile browser chrome on small screens.
 */
function BackgroundCard({ title, message, percent, onExpand, onCancel, canCancel, inline = false }) {
  return (
    <div className={inline ? "pointer-events-none" : "pointer-events-none fixed bottom-20 right-4 z-[80] sm:bottom-6"}>
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "slide-in-right pointer-events-auto relative w-[min(86vw,320px)] overflow-hidden",
          "rounded border border-border bg-surface"
        )}
      >
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <Ring className="size-3.5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium leading-tight text-text-main">
              {title || "Working"}
            </p>
            {message ? (
              <p className="mt-0.5 truncate font-mono text-[11px] leading-tight text-text-muted">
                {message}
              </p>
            ) : null}
          </div>
          {percent !== null ? (
            <span className="shrink-0 font-mono text-[11px] font-semibold tabular-nums text-primary">
              {percent}%
            </span>
          ) : null}
          <div className="flex shrink-0 items-center gap-1">
            {onExpand ? (
              <IconButton label="Show full banner" glyph="expand_more" onClick={onExpand} />
            ) : null}
            {canCancel ? (
              <button
                type="button"
                onClick={onCancel}
                title="Cancel"
                aria-label="Cancel operation"
                className="inline-flex items-center gap-1 rounded px-2 py-1.5 text-[11px] font-medium text-text-muted transition-colors hover:bg-danger/10 hover:text-danger"
              >
                <span className="material-symbols-outlined text-[13px] leading-none">close</span>
                Cancel
              </button>
            ) : null}
          </div>
        </div>
        <ProgressBar percent={percent} />
      </div>
    </div>
  );
}

/**
 * The full card. One rectangle: title and progress read on the left, the two
 * controls on the right, and the bar on the bottom edge. No helper copy: the
 * card reports what is happening (title, message, percent) and nothing else.
 */
function Panel({ title, message, percent, canCancel, canBackground, onCancel, onBackground }) {
  return (
    <div
      className={cn(
        "relative w-full max-w-sm overflow-hidden rounded border border-border bg-surface"
      )}
    >
      <div className="px-4 pb-4 pt-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded border border-border-subtle text-primary">
            <Ring className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight text-text-main">
              {title || "Working"}
            </p>
            {message ? (
              <p className="mt-1 truncate font-mono text-xs leading-tight text-text-muted">
                {message}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <div className="flex items-center gap-1">
              {canCancel ? (
                <IconButton
                  label="Cancel"
                  glyph="close"
                  tone="danger"
                  onClick={onCancel}
                />
              ) : null}
              {canBackground ? (
                <IconButton label="Run in background" onClick={onBackground}>
                  {/* Two squares overlapping: a card being tucked behind the
                      one in front of it, which is what "run in background" does. */}
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="size-4 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinejoin="round"
                  >
                    <rect x="9" y="9" width="11" height="11" rx="2" />
                    <rect x="4" y="4" width="11" height="11" rx="2" />
                  </svg>
                </IconButton>
              ) : null}
            </div>
            {percent !== null ? (
              <span className="font-mono text-[11px] font-semibold tabular-nums text-primary">
                {percent}%
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <ProgressBar percent={percent} />
    </div>
  );
}

/** How long the overlay fades before the card takes over. Matches the fade. */
const SWAP_MS = 160;

// Background decision per banner instance. Keyed the same way the callers key
// their ProgressCard (by title), so a remount re-reads it instead of starting
// the operator over at a full-screen overlay.
const backgroundedKeys = new Set();

// Mounted banners hold `backgrounded` as local state and read the map above
// once, at mount - so clearing the map alone changed nothing for a banner
// already collapsed in the corner, and the bell's reveal looked like it did
// nothing. A listener set lets the reveal reach the instances on screen; the
// map stays what it was, the cross-mount memory of the decision.
const revealListeners = new Set();

/** Subscribe a mounted banner to reveals. Returns the unsubscribe. */
export function subscribeToTaskReveal(listener) {
  revealListeners.add(listener);
  return () => revealListeners.delete(listener);
}

/**
 * Expand every backgrounded banner again.
 *
 * The bell lists in-flight server jobs; picking one has to bring its banner
 * back rather than leave it sitting in the corner, or the click looks like it
 * did nothing. Only the visual state flips - the task store, and therefore the
 * actual job, was never paused.
 */
export function revealBackgroundedTasks() {
  backgroundedKeys.clear();
  for (const listener of revealListeners) listener();
}

export default function LongTaskBanner({
  title,
  message,
  progress = null,
  fixed = true,
  inlineChip = false,
  className,
  onCancel = null,
  onBackground = null,
  canExpand = false,
  // Renders only the collapsed card. The TaskDock uses this for every task
  // already waiting behind the newest one.
  chipOnly = false,
  // Collapsed-card reopen hook: the dock owns that state, so it flips back
  // itself instead of expanding inside this component.
  onExpand = null,
}) {
  const instanceKey = typeof title === "string" && title ? title : "__banner__";
  const percent =
    typeof progress === "number" && Number.isFinite(progress)
      ? Math.min(100, Math.max(0, Math.round(progress <= 1 ? progress * 100 : progress)))
      : null;
  const [backgrounded, setBackgrounded] = useState(() => backgroundedKeys.has(instanceKey));
  const [exiting, setExiting] = useState(false);
  const swapTimer = useRef(null);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;

  // Backgrounding must survive a remount. ProgressCard is keyed by `title`, so
  // an operation whose card remounts used to come back full-screen even though
  // the operator had already sent it to the corner: the overlay reappeared and
  // kept covering the page. The decision is therefore stored per instance key
  // in a module map, not per mount.
  const setBackgroundedPersisted = (value) => {
    if (value) backgroundedKeys.set(instanceKey, true);
    else backgroundedKeys.delete(instanceKey);
    setBackgrounded(value);
  };

  // The swap timer outlives renders that change props mid-transition.
  useEffect(() => () => clearTimeout(swapTimer.current), []);

  // A reveal from the bell has to reach THIS instance, not only the next
  // mount: the map above is read once, at mount time, so a card already
  // backgrounded never re-rendered and the click did nothing. Flipping local
  // state here is visual only - the task store, and the job behind it, were
  // never paused.
  useEffect(
    () =>
      subscribeToTaskReveal(() => {
        backgroundedKeys.delete(instanceKey);
        setBackgrounded(false);
      }),
    [instanceKey]
  );

  // Escape cancels, but only while the card still covers the page: a card in
  // the corner must not swallow a keystroke meant for the form underneath.
  useEffect(() => {
    if (backgrounded || !onCancel) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") cancelRef.current?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [backgrounded, onCancel]);

  const handleCancel = () => {
    setBackgroundedPersisted(false);
    setExiting(false);
    clearTimeout(swapTimer.current);
    onCancel?.();
  };
  // A card rendered without the rest of the banner has nothing to expand back
  // to, so cancelling there only forwards the caller's own onCancel.
  const handleChipCancel = () => {
    onCancel?.();
  };
  const handleBackground = () => {
    // Fade the overlay out first; an instant swap reads as a teleport.
    setExiting(true);
    clearTimeout(swapTimer.current);
    // Tell the caller first: a host modal closes at once instead of staying
    // mounted on top of the page, which is what made the UI feel stuck.
    onBackground?.();
    swapTimer.current = setTimeout(() => {
      setBackgroundedPersisted(true);
      setExiting(false);
    }, SWAP_MS);
  };

  const canCancel = typeof onCancel === "function";
  // A page-level card is always escapable, even with no abort hook: hiding
  // is visual only and beats a card with no buttons.
  const canBackground = typeof onBackground === "function" || fixed;

  if (chipOnly) {
    return (
      <BackgroundCard
        title={title}
        message={message}
        percent={percent}
        inline={inlineChip}
        canCancel={canCancel}
        canExpand={canExpand && typeof onExpand === "function"}
        onExpand={onExpand || undefined}
        onCancel={handleChipCancel}
      />
    );
  }

  if (backgrounded) {
    return (
      <BackgroundCard
        title={title}
        message={message}
        percent={percent}
        canCancel={canCancel}
        canExpand={canExpand && typeof onBackground === "function"}
        onExpand={() => setBackgroundedPersisted(false)}
        onCancel={handleCancel}
      />
    );
  }

  // The overlay is a thin scrim, not a blur: the operator is waiting on a
  // status panel, not a modal, and a blurred full-screen wash reads as
  // "something is blocking me" when nothing is.
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-end justify-end p-4 sm:p-6",
        exiting ? "opacity-0 transition-opacity duration-150" : "fade-in",
        fixed ? "fixed inset-0 z-[70]" : "absolute inset-0 z-10 rounded-[10px]",
        className
      )}
      style={{ backgroundColor: "var(--color-scrim)" }}
    >
      <Panel
        title={title}
        message={message}
        percent={percent}
        canCancel={canCancel}
        canBackground={canBackground}
        onCancel={handleCancel}
        onBackground={handleBackground}
      />
    </div>
  );
}

LongTaskBanner.propTypes = {
  title: PropTypes.string,
  message: PropTypes.string,
  progress: PropTypes.number,
  fixed: PropTypes.bool,
  /** Render the collapsed card inside the caller's own positioned column. */
  inlineChip: PropTypes.bool,
  className: PropTypes.string,
  onCancel: PropTypes.func,
  onBackground: PropTypes.func,
  /** Lets the collapsed card reopen the full banner. */
  canExpand: PropTypes.bool,
  /** Render only the collapsed card. */
  chipOnly: PropTypes.bool,
  /** Collapsed-card reopen hook (card mode). */
  onExpand: PropTypes.func,
};

export { LongTaskBanner };
