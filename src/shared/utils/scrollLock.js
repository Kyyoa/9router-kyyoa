// Reference-counted body scroll lock for Modal and Drawer.
//
// Why a counter rather than the previous `document.body.style.overflow = ""`:
// several pages render a Modal and a ConfirmModal (or an OAuth modal) at the
// same time. Each one set the inline style directly and each cleanup cleared
// it, so closing the inner dialog released the lock while the outer one was
// still open - background scroll came back behind an open modal.
//
// The scrollbar compensation is what keeps the app from jumping: hiding the
// scrollbar widens the viewport by its width, so every centred element on the
// page shifts sideways at the moment a modal opens.

let depth = 0;
let compensatedPadding = null;

export function lockBodyScroll() {
  if (typeof document === "undefined") return;
  depth += 1;
  if (depth > 1) return;

  const body = document.body;
  const gap = window.innerWidth - document.documentElement.clientWidth;
  compensatedPadding = body.style.paddingRight;
  if (gap > 0) {
    const current = parseFloat(window.getComputedStyle(body).paddingRight) || 0;
    body.style.paddingRight = `${current + gap}px`;
  }
  body.style.overflow = "hidden";
}

export function unlockBodyScroll() {
  if (typeof document === "undefined") return;
  depth = Math.max(0, depth - 1);
  if (depth > 0) return;

  const body = document.body;
  body.style.overflow = "";
  body.style.paddingRight = compensatedPadding ?? "";
  compensatedPadding = null;
}
