/** Browser lifecycle only; no knowledge of game rules, stores, or requests. */
export function observeAnimationFrames(
  window: Pick<Window, "requestAnimationFrame" | "cancelAnimationFrame">,
  observe: () => void,
): () => void {
  let disposed = false;
  let frame = 0;
  const tick = () => {
    if (disposed) return;
    observe();
    if (!disposed) frame = window.requestAnimationFrame(tick);
  };
  frame = window.requestAnimationFrame(tick);
  return () => {
    disposed = true;
    window.cancelAnimationFrame(frame);
  };
}
