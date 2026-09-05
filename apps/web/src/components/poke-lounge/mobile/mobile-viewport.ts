const WIDTH = "--poke-lounge-container-width";
const HEIGHT = "--poke-lounge-container-height";
const TOP = "--poke-lounge-viewport-top";
const LEFT = "--poke-lounge-viewport-left";

/** Keep the game and its task screens inside the same visible browser rectangle.
 * Mobile browser chrome can move it on scroll, not just on window resize.
 * Pinch zoom must continue to magnify/pan the existing layout, not shrink it.
 */
export function bindMobileViewport(
  page: HTMLElement,
  { mobile, fullscreenEvent }: { mobile: boolean; fullscreenEvent: string },
): { update(): void; dispose(): void } {
  const owner = page.ownerDocument;
  const win = owner.defaultView;
  if (!win) return { update() {}, dispose() {} };
  const viewport = win.visualViewport;
  let frame: number | null = null;
  let disposed = false;
  const restorers: Array<() => void> = [];

  if (mobile) {
    for (const element of [owner.documentElement, owner.body]) {
      for (const [property, value] of [
        ["overflow", "hidden"],
        ["overscroll-behavior", "none"],
      ]) {
        const previous = element.style.getPropertyValue(property);
        const priority = element.style.getPropertyPriority(property);
        element.style.setProperty(property, value);
        restorers.push(() => {
          if (previous) element.style.setProperty(property, previous, priority);
          else element.style.removeProperty(property);
        });
      }
    }
  }

  const setPixelProperty = (property: string, value: number) => {
    const next = `${value}px`;
    if (page.style.getPropertyValue(property) !== next) page.style.setProperty(property, next);
  };
  const update = () => {
    if (disposed) return;
    const active = owner.activeElement;
    // A smaller visual viewport can be caused by browser toolbars. Never latch
    // the keyboard flag after the text field loses focus or is unmounted.
    const editing =
      !!active &&
      page.contains(active) &&
      active.matches(
        'textarea, input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="color"]):not([type="hidden"]), [contenteditable="true"]',
      );
    page.toggleAttribute("data-poke-lounge-keyboard-open", mobile && editing);

    if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
    const width = viewport?.width ?? win.innerWidth;
    const height = viewport?.height ?? win.innerHeight;
    // Background tabs and intermediate orientation frames may briefly report 0.
    if (width <= 0 || height <= 0) return;
    setPixelProperty(WIDTH, Math.floor(width));
    setPixelProperty(HEIGHT, Math.floor(height));
    setPixelProperty(TOP, mobile ? Math.max(0, viewport?.offsetTop ?? 0) : 0);
    setPixelProperty(LEFT, mobile ? Math.max(0, viewport?.offsetLeft ?? 0) : 0);
  };
  const refresh = () => {
    update();
    // Sample again after layout settles (notably focusout/keyboard dismissal).
    if (frame === null)
      frame = win.requestAnimationFrame(() => {
        frame = null;
        update();
      });
  };
  const clearRootScroll = () => {
    // overflow: clip already prevents this on modern browsers. Also protect
    // fallback engines from focus/scrollIntoView scrolling the outer game box.
    if (mobile && (viewport?.scale ?? 1) <= 1.01) {
      page.scrollTop = 0;
      page.scrollLeft = 0;
    }
    refresh();
  };
  const events: Array<[EventTarget, string, EventListener]> = [
    [page, "focusin", refresh],
    [page, "focusout", refresh],
    [page, "scroll", clearRootScroll],
    [win, "resize", refresh],
    [win, "scroll", refresh],
    [win, "pageshow", refresh],
    [win, "orientationchange", refresh],
    [owner, "visibilitychange", refresh],
    [owner, "fullscreenchange", refresh],
    [owner, fullscreenEvent, refresh],
  ];
  if (viewport) events.push([viewport, "resize", refresh], [viewport, "scroll", refresh]);
  for (const [target, name, handler] of events) target.addEventListener(name, handler);
  clearRootScroll();

  return {
    update: refresh,
    dispose() {
      disposed = true;
      if (frame !== null) win.cancelAnimationFrame(frame);
      for (const [target, name, handler] of events) target.removeEventListener(name, handler);
      for (const restore of restorers.reverse()) restore();
      for (const property of [WIDTH, HEIGHT, TOP, LEFT]) page.style.removeProperty(property);
      page.removeAttribute("data-poke-lounge-keyboard-open");
    },
  };
}
