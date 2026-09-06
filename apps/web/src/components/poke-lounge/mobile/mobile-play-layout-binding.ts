import { calculateMobilePlayLayout } from "./mobile-play-layout";

const ATTRIBUTE = "data-poke-lounge-responsive-layout";
const PREFIX = "--poke-lounge-layout-";
const KEYS = [
  "width",
  "frame-width",
  "frame-height",
  "controller-width",
  "controller-height",
  "status-height",
  "gap",
];

/** The only writer of play geometry. Component measurements cannot feed back
 * their assigned height into the parent's requested height. */
export function bindMobilePlayLayout(page: HTMLElement) {
  const owner = page.ownerDocument;
  const win = owner.defaultView;
  if (!win) return { update() {}, dispose() {} };
  let disposed = false;
  let frame: number | null = null;
  let observedBar: HTMLElement | null = null;
  const setPixels = (key: string, value: number) => {
    const next = `${Math.round(value * 10000) / 10000}px`;
    if (page.style.getPropertyValue(PREFIX + key) !== next)
      page.style.setProperty(PREFIX + key, next);
  };
  const clear = () => {
    page.removeAttribute(ATTRIBUTE);
    for (const key of KEYS) page.style.removeProperty(PREFIX + key);
  };
  const update = () => {
    if (disposed || Math.abs((win.visualViewport?.scale ?? 1) - 1) > 0.01) return;
    const bar = page.querySelector<HTMLElement>("[data-poke-lounge-play-status]");
    if (bar !== observedBar) {
      if (observedBar) observer.unobserve(observedBar);
      if (bar) observer.observe(bar);
      observedBar = bar;
    }
    if (page.dataset.pokeLoungePlayLayout !== "true") {
      if (page.hasAttribute(ATTRIBUTE)) clear();
      return;
    }
    const style = win.getComputedStyle(page);
    const px = (value: string) => Number.parseFloat(value) || 0;
    const layout = calculateMobilePlayLayout({
      width: page.clientWidth - px(style.paddingLeft) - px(style.paddingRight),
      height: page.clientHeight - px(style.paddingTop) - px(style.paddingBottom),
      statusHeight: bar?.getBoundingClientRect().height ?? 56,
      fontSize: px(win.getComputedStyle(owner.documentElement).fontSize),
    });
    setPixels("width", layout.width);
    setPixels("frame-width", layout.frameWidth);
    setPixels("frame-height", layout.frameHeight);
    setPixels("controller-width", layout.controllerWidth);
    setPixels("controller-height", layout.controllerHeight);
    setPixels("status-height", layout.statusHeight);
    setPixels("gap", layout.gap);
    if (page.getAttribute(ATTRIBUTE) !== layout.mode) page.setAttribute(ATTRIBUTE, layout.mode);
  };
  const schedule = () => {
    if (disposed || frame !== null) return;
    frame = win.requestAnimationFrame(() => {
      frame = null;
      update();
    });
  };
  const observer = new ResizeObserver(schedule);
  observer.observe(page);
  const mutations = new MutationObserver(schedule);
  // Only direct children/root style, not animated world descendants.
  mutations.observe(page, {
    childList: true,
    attributes: true,
    attributeFilter: ["style", "class", "data-poke-lounge-play-layout"],
  });
  mutations.observe(owner.documentElement, {
    attributes: true,
    attributeFilter: ["style", "class"],
  });
  owner.fonts?.ready.then(schedule);
  update();
  return {
    update,
    dispose() {
      disposed = true;
      if (frame !== null) win.cancelAnimationFrame(frame);
      observer.disconnect();
      mutations.disconnect();
      clear();
    },
  };
}
