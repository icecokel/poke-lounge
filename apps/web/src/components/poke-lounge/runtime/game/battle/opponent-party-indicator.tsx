import { cn } from "@/lib/utils";
import {
  getOpponentPartyCopy,
  type OpponentPartySummary,
} from "@/features/poke-lounge/presentation/battle/opponent-party";
import {
  DESKTOP_BATTLE_STAGE_LAYOUT,
  getOpponentPartyIndicatorRect,
  toBattleRectStyle,
  type BattleStageLayout,
} from "./battle-stage-layout";

export function OpponentPartyIndicator({
  summary,
  locale,
  desktop,
  layout = DESKTOP_BATTLE_STAGE_LAYOUT,
  inline = false,
}: {
  summary: OpponentPartySummary;
  locale: string;
  desktop: boolean;
  layout?: BattleStageLayout;
  inline?: boolean;
}) {
  const text = getOpponentPartyCopy(locale, summary);

  return (
    <div
      className={cn(
        "pointer-events-none absolute flex items-center justify-between gap-[0.7cqw] rounded-[0.65cqw] bg-[rgb(255_255_240_/_92%)] px-[0.8cqw] text-[clamp(9px,2.7cqw,28px)] leading-none text-[var(--pl-color-ink,#24392c)] select-none",
        inline &&
          "static h-auto min-h-[22px] w-full justify-start gap-2 bg-transparent px-0 py-0.5 text-xs",
      )}
      style={inline ? undefined : toBattleRectStyle(getOpponentPartyIndicatorRect(layout), layout)}
      role="img"
      aria-label={text.label}
      data-poke-lounge-opponent-party={inline ? "context" : "true"}
      data-remaining={summary.remaining}
      data-total={summary.total}
    >
      {inline ? <span aria-hidden="true">{text.opponent}</span> : null}
      <span
        className={cn("flex shrink-0 items-center gap-[0.7cqw]", inline && "gap-1")}
        aria-hidden="true"
      >
        {summary.slots.map(slot => (
          <span
            key={slot.slotIndex}
            className={cn(
              "relative block size-[clamp(8px,3.125cqw,32px)] [--ball-bottom:#fffced] [--ball-outline:#293b30] [--ball-top:#c94638] after:absolute after:right-[15%] after:bottom-[-0.55cqw] after:left-[15%] after:hidden after:h-[max(1px,0.3cqw)] after:rounded-px after:bg-[var(--pl-color-ink,#24392c)] after:content-[''] data-[active=true]:after:block",
              slot.fainted &&
                "[--ball-bottom:#d1d4cc] [--ball-outline:#555e55] [--ball-top:#a2a7a0]",
              inline && "size-3.5 after:bottom-[-3px] after:h-px",
            )}
            data-slot-index={slot.slotIndex}
            data-fainted={slot.fainted || undefined}
            data-active={slot.active || undefined}
          >
            <svg
              className="block size-full"
              viewBox="0 0 16 16"
              aria-hidden="true"
              focusable="false"
            >
              <circle
                cx="8"
                cy="8"
                r="7"
                fill="var(--ball-bottom)"
                stroke="var(--ball-outline)"
                strokeWidth="1.5"
              />
              <path
                d="M1 8a7 7 0 0 1 14 0Z"
                fill="var(--ball-top)"
                stroke="var(--ball-outline)"
                strokeWidth="1.5"
              />
              <circle
                cx="8"
                cy="8"
                r="2.3"
                fill="var(--ball-bottom)"
                stroke="var(--ball-outline)"
                strokeWidth="1.5"
              />
              {slot.fainted ? (
                <path
                  d="m4 4 8 8m0-8-8 8"
                  fill="none"
                  stroke="var(--ball-outline)"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                />
              ) : null}
            </svg>
          </span>
        ))}
      </span>
      <span
        className={cn(
          "flex shrink-0 items-baseline gap-[0.7cqw] whitespace-nowrap tabular-nums",
          inline && "ml-auto",
        )}
        aria-hidden="true"
        data-poke-lounge-opponent-party-count="true"
      >
        {desktop ? (
          <small className="text-[0.8em] [@container(max-width:450px)]:hidden">
            {text.remaining}
          </small>
        ) : null}
        <strong className="font-extrabold">
          {summary.remaining}/{summary.total}
        </strong>
      </span>
    </div>
  );
}
