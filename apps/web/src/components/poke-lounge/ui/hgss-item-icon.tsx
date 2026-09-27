import { Candy, CircleDot, Diamond, FlaskConical, Package } from "lucide-react";

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
      className="inline-grid size-9 shrink-0 place-items-center rounded-lg border-2 border-[#725a39] bg-[linear-gradient(#fff4ce_50%,#efdaa5_50%)] text-[#614b32] shadow-[inset_0_0_0_2px_#fffdf0] data-[kind=ball]:border-[#7e5050] data-[kind=ball]:bg-[linear-gradient(#f9d4cb_50%,#fffdf0_50%)] data-[kind=ball]:text-[#a33c3c] data-[kind=medicine]:border-[#757c9b] data-[kind=medicine]:bg-[linear-gradient(#eee4fa_50%,#d7d7ec_50%)] data-[kind=medicine]:text-[#4f5584] data-[kind=candy]:border-[#6d9bb3] data-[kind=candy]:bg-[linear-gradient(#e4f6fa_50%,#b8dbed_50%)] data-[kind=candy]:text-[#3f7196] data-[kind=revive]:bg-[linear-gradient(#fff9d5_50%,#f6dc7c_50%)] data-[kind=revive]:text-[#826315]"
      data-kind={kind}
      aria-hidden="true"
      data-poke-lounge-item-icon={id}
    >
      <Icon size={23} strokeWidth={2.25} />
    </span>
  );
}
