"use client";

import PropTypes from "prop-types";
import { cn } from "@/shared/utils/cn";

/**
 * PageShell - the one layout primitive every dashboard page renders inside.
 *
 * WHY: DashboardLayout owns the scroll container and its outer gutter, but
 * everything below it invented its own padding scale (`px-1 sm:px-0`, plain
 * nothing, `max-w-5xl` typed by hand) and its own rhythm, so sibling pages sat
 * at different insets and jumped as the window crossed a breakpoint. PageShell
 * owns that decision once; a page only declares its content and its width.
 *
 * CONTRACT (breakpoints are stated, not implied):
 *   base (<=767px, 375 target): one column, gap-4 (16px) between blocks,
 *                               full width minus the shell gutter.
 *   sm   (>=640px):             same rhythm, a page grid may go 2-up.
 *   md   (768-1023px, target):  gap-5 (20px) between blocks.
 *   lg   (>=1024px):            gap-6 (24px); the measure is capped by
 *                               `width` so prose stays readable.
 *   xl   (>=1280px, 1440 target): unchanged from lg - the cap does the work.
 *
 * `width` is a named max-width token, not a class each page re-types:
 *   "reading"  max-w-5xl - forms, settings, prose
 *   "content"  max-w-7xl - grids and mixed content (default)
 *   "full"     no cap    - log viewers and other wide surfaces
 *
 * Horizontal padding stays OUT of PageShell on purpose: DashboardLayout is
 * already the gutter, and a second scale would double the inset on every page.
 * `bleed` opts one block out instead (the console log viewer wants the full
 * viewport for monospace lines) via a negative margin that is undone at sm.
 *
 * Grids: PageShell never picks column counts. Pages keep declaring
 * `grid-cols-1 sm:grid-cols-2 ...`, which stacks at base by construction -
 * the one rule that keeps a card grid readable at 375px.
 *
 * Tables: wide tables go inside <TableScroll> so they scroll instead of
 * clipping. The page keeps its markup; only the wrapper is shared.
 */
const WIDTHS = {
  reading: "max-w-5xl",
  content: "max-w-7xl",
  full: "",
};

export default function PageShell({ children, width = "content", bleed = false, className }) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full min-w-0 flex-col gap-4 md:gap-5 lg:gap-6",
        WIDTHS[width] || WIDTHS.content,
        bleed && "-mx-4 px-4 sm:mx-0 sm:px-0",
        className
      )}
    >
      {children}
    </div>
  );
}

PageShell.propTypes = {
  children: PropTypes.node,
  width: PropTypes.oneOf(["reading", "content", "full"]),
  bleed: PropTypes.bool,
  className: PropTypes.string,
};

/**
 * TableScroll - shared horizontal scroll container for wide tables.
 *
 * A bare `overflow-x-auto` still lets a 10-column table shrink cells to
 * unreadable slivers at 375px, so the inner floor keeps every column legible
 * and moves the overflow into a swipe. The outer row cancels the shell gutter
 * on a phone (edge-to-edge scroll) and lines back up with the page content
 * from sm up, where there is room to spare.
 */
export function TableScroll({ children, className, minWidth = "min-w-[640px]" }) {
  return (
    <div className={cn("-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 custom-scrollbar scroll-thin-x", className)}>
      <div className={minWidth}>{children}</div>
    </div>
  );
}

TableScroll.propTypes = {
  children: PropTypes.node,
  className: PropTypes.string,
  minWidth: PropTypes.string,
};
