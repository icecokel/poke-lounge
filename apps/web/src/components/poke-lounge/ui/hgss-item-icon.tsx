import { Candy, CircleDot, Diamond, FlaskConical, Package } from "lucide-react";
import styles from "./hgss-ui.module.css";

/** Visual categorization only; item behavior and availability remain in the runtime. */
export function HgssItemIcon({ id }: { id: string }) {
  const key = id.toLowerCase();
  const kind = key.endsWith("ball")
    ? "ball"
    : key.includes("candy")
      ? "candy"
      : key.includes("revive")
        ? "revive"
        : /potion|restore|heal|antidote|awakening/.test(key)
          ? "medicine"
          : "other";
  const Icon = {
    ball: CircleDot,
    candy: Candy,
    revive: Diamond,
    medicine: FlaskConical,
    other: Package,
  }[kind];
  return (
    <span
      className={styles.itemIcon}
      data-kind={kind}
      aria-hidden="true"
      data-poke-lounge-item-icon={id}
    >
      <Icon size={23} strokeWidth={2.25} />
    </span>
  );
}
