export function setShortcutGuideTouchControlsSuppressed(suppressed: boolean): void {
  if (typeof document === "undefined") {
    return;
  }

  document.body.classList.toggle("is-shortcut-guide-open", suppressed);
}
