"use client";

// Marks for the custom plugins and the native model capabilities.
//
// SVG rather than the material-symbols font on purpose. The project ships only a
// 143-glyph subset of that font, so a name outside the subset renders blank, and
// a ligature is shared with every other surface that uses it - a plugin mark
// could not be told apart from an unrelated button. These paths are unique per
// mark and legible at 14px and at 24px.
//
// One drawing language:
//   * a single shape + one accent, 24x24 grid, round caps, strokes >= 2.0;
//   * colour is NOT carried by the tile - the caller's tile is neutral and the
//     glyph itself is the accent, so seven plugins read as one system instead of
//     seven unrelated coloured chips;
//   * a mark must survive being drawn at 14px in a model row next to another,
//     so no hairlines and no detail finer than 2.4 units.

const PLUGIN_MARKS = {
  // Vision: an eye - an almond lens with a solid pupil. "Sees the image."
  // Image Vision: viewfinder corners around a hollow lens ring - the frame a
  // picture goes into. The ring is stroked, never filled, so it cannot read
  // as native vision's solid pupil on a model row. (The old mark reused the
  // same solid dot and the two blurred together at 14px.)
  imageVision: (
    <>
      <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  // Reasoning: three concepts joined - a chain of thought drawn as a graph.
  // Nodes grew from r=2.3 to r=2.6 and the links were re-seated on their
  // edges; at 14px the old nodes blurred into the links and the graph read
  // as a triangle doodle.
  // Think Deeper: plates narrowing into the page with a chevron driving down
  // through them - depth. (The old equal-width bars read as a hamburger menu
  // with a chevron under it.)
  thinkDeeper: (
    <>
      <path d="M4.5 5.5h15" />
      <path d="M7 10h10" />
      <path d="M9.5 14.5h5" />
      <path d="M9.3 17.6l2.7 2.7 2.7-2.7" />
    </>
  ),
  // Speed Mode: a lightning bolt - the answer comes back now, no thinking
  // first. The bolt alone is the whole mark; it needs no second reading.
  // (The old play triangle with a bar read as "next track".)
  speedMode: <path d="M13.5 3.5L6.2 13H11l-0.5 7.5 7.3-9.8h-4.9z" />,
  // JSON Guard: braces sealing a checked value - the structure is valid.
  jsonGuard: (
    <>
      <path d="M9.4 4.5C7.9 4.5 7.5 5.3 7.5 6.6v2c0 1.2-.6 1.9-1.7 1.9 1.1 0 1.7.7 1.7 1.9v2c0 1.3.4 2.1 1.9 2.1" />
      <path d="M14.6 4.5c1.5 0 1.9.8 1.9 2.1v2c0 1.2.6 1.9 1.7 1.9-1.1 0-1.7.7-1.7 1.9v2c0 1.3-.4 2.1-1.9 2.1" />
      <path d="M9.6 12.2l1.7 1.7 3.2-3.4" />
    </>
  ),
  // Context Squeezer: two presses closing on a stack from the sides - same
  // content, less room. Squeezing sideways keeps it apart from Think Deeper's
  // downward chevron. (The old vertical chevrons around a full-width bar read
  // as expand/collapse.)
  contextSqueezer: (
    <>
      <path d="M9.4 8.5h5.2M9.4 12h5.2M9.4 15.5h5.2" />
      <path d="M6.6 6.5L4.5 12l2.1 5.5" />
      <path d="M17.4 6.5l2.1 5.5-2.1 5.5" />
    </>
  ),
  // OpenAI Tool Bridge: two docks joined by one cable arcing over like a
  // bridge, the recovered call crossing at the apex dot. (The old S-curve
  // sagged through the middle and read as a squiggle at 14px.)
  openaiToolBridge: (
    <>
      <path d="M5 6.5v11" />
      <path d="M19 6.5v11" />
      <path d="M5 12c2.5 0 3-5 7-5s4.5 5 7 5" />
      <circle cx="12" cy="7" r="1.8" fill="currentColor" stroke="none" />
    </>
  ),
  // Anti Slop: a funnel - the flow passes, the specks are caught at the neck.
  antiSlop: (
    <>
      <path d="M4.5 5.5h15l-4.6 6.4v5.2l-5.8 2.6v-7.8z" />
      <path d="M8 8.6h8" />
    </>
  ),
};

/**
 * One wrapper for every mark so stroke weight, caps and sizing live in one place
 * and cannot drift between the card tile and a model row. An unknown name
 * renders nothing - never a ligature fallback.
 */
function PluginMark({ name, size = 20, strokeWidth = 2, className = "" }) {
  const mark = PLUGIN_MARKS[name];
  if (!mark) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {mark}
    </svg>
  );
}

export default PluginMark;
