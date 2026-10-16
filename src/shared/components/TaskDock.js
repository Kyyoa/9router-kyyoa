"use client";

import { useEffect, useState } from "react";
import LongTaskBanner, { subscribeToTaskReveal } from "./LongTaskBanner";
import { useTaskStore } from "@/store/taskStore";

/**
 * Renders every running long task above the dashboard, mounted once in the
 * dashboard layout so navigation never unmounts it.
 *
 * The newest task starts in the foreground; anything the operator has collapsed
 * (and the older tasks behind it) renders as a corner chip. Each banner owns its
 * own collapsed state, so backgrounding one is local and survives an update to
 * the task, and the tasks keep reporting progress while the operator navigates.
 */
export default function TaskDock() {
  const tasks = useTaskStore((s) => s.tasks);
  if (!tasks.length) return null;

  const [first, ...rest] = tasks;
  return (
    <>
      <DockBanner key={first.id} task={first} startForeground />
      <div className="pointer-events-none fixed bottom-20 right-4 sm:bottom-6 z-[65] flex w-[min(86vw,320px)] flex-col gap-2">
        {rest.map((task) => (
          <DockBanner key={task.id} task={task} startForeground={false} />
        ))}
      </div>
    </>
  );
}

/**
 * One task = one banner. The first task takes the full-screen banner (it can
 * background into the corner); everything behind it skips straight to the chip.
 * Chips render position-free inside the dock stack, so five imports queue as
 * five cards in one column, not five fixed overlays.
 */
function DockBanner({ task, startForeground }) {
  // Backgrounding is LATCHED, not derived. It used to be plain component state,
  // so the first task rendered a full-screen overlay (fixed inset-0) and the
  // moment the operator pressed "Run in background" the overlay was still in the
  // tree for one more paint - and every later render re-created it, because
  // `fixed` was recomputed from this flag. The result was a task that looked
  // backgrounded (a corner chip) while an invisible sheet still swallowed every
  // click on the page. Keeping the flag here and never re-deriving `fixed`
  // from it means the overlay unmounts the same render the chip appears.
  const [backgrounded, setBackgrounded] = useState(!startForeground);

  // The latch is local state, so a reveal from the bell reaches it only
  // through a subscription: the map in LongTaskBanner is read at mount time
  // and this card never remounts while collapsed. A task that never had the
  // foreground stays a chip; only the newest task owns the full banner.
  useEffect(() => {
    if (!startForeground) return undefined;
    return subscribeToTaskReveal(() => setBackgrounded(false));
  }, [startForeground]);

  // A task that is not the newest one has never had a foreground banner, so it
  // is a chip by definition and has nothing to expand back to.
  const canExpand = startForeground;

  return (
    <LongTaskBanner
      fixed={startForeground && !backgrounded}
      inlineChip={!startForeground}
      title={task.title}
      message={task.message}
      progress={task.progress ?? null}
      chipOnly={startForeground ? backgrounded : true}
      onCancel={() => useTaskStore.getState().cancel(task.id)}
      onBackground={() => setBackgrounded(true)}
      onExpand={() => setBackgrounded(false)}
      canExpand={canExpand}
    />
  );
}