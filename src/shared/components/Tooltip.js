"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Bubble chrome comes from `.chrome-tooltip` (colours, border, chip radius,
// tier-3 shadow) so every tooltip is the same surface. This component keeps
// only positioning, which is its own job.
export default function Tooltip({ text, children, position = "top", color }) {
  const anchorRef = useRef(null);
  const [style, setStyle] = useState(null);

  // Render via portal + fixed positioning so overflow/scroll ancestors can't clip the bubble
  const handleMouseEnter = () => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const midX = rect.left + rect.width / 2;
    const midY = rect.top + rect.height / 2;
    let pos;
    if (position === "bottom") pos = { top: rect.bottom + 6, left: midX, transform: "translateX(-50%)" };
    else if (position === "left") pos = { right: window.innerWidth - rect.left + 6, top: midY, transform: "translateY(-50%)" };
    else if (position === "right") pos = { left: rect.right + 6, top: midY, transform: "translateY(-50%)" };
    else pos = { bottom: window.innerHeight - rect.top + 6, left: midX, transform: "translateX(-50%)" };
    setStyle({ position: "fixed", ...pos });
  };

  // Touch devices have no hover: the first tap shows the bubble, the second
  // passes through to the child. Otherwise a Tooltip-wrapped control is
  // permanently one tap behind on mobile.
  const handleTouchStart = () => {
    if (!style) handleMouseEnter();
  };

  useEffect(() => {
    if (!style) return undefined;
    const dismiss = () => setStyle(null);
    window.addEventListener("scroll", dismiss, { capture: true, passive: true });
    window.addEventListener("resize", dismiss);
    return () => {
      window.removeEventListener("scroll", dismiss, { capture: true });
      window.removeEventListener("resize", dismiss);
    };
  }, [style]);

  return (
    <div
      ref={anchorRef}
      className="relative inline-flex"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setStyle(null)}
      onTouchStart={handleTouchStart}
    >
      {children}
      {style && createPortal(
        <div
          role="tooltip"
          className="chrome-tooltip pointer-events-none z-50 w-max max-w-56 whitespace-normal"
          style={{ ...style, ...(color ? { backgroundColor: color } : {}) }}
        >
          {text}
        </div>,
        document.body
      )}
    </div>
  );
}
