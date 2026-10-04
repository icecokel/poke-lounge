/** Canonical Korean copy; the runtime localization layer translates it for each locale. */
export function formatFieldInteractionKey(mobile: boolean): string {
  return mobile ? "대화" : "Enter / Space / Z";
}
