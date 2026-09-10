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
import styles from "./opponent-party-indicator.module.css";

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
      className={`${styles.indicator} ${inline ? styles.inline : ""}`}
      style={inline ? undefined : toBattleRectStyle(getOpponentPartyIndicatorRect(layout), layout)}
      role="img"
      aria-label={text.label}
      data-poke-lounge-opponent-party={inline ? "context" : "true"}
      data-remaining={summary.remaining}
      data-total={summary.total}
    >
      {inline ? <span aria-hidden="true">{text.opponent}</span> : null}
      <span className={styles.slots} aria-hidden="true">
        {summary.slots.map(slot => (
          <span
            key={slot.slotIndex}
            className={styles.slot}
            data-slot-index={slot.slotIndex}
            data-fainted={slot.fainted || undefined}
            data-active={slot.active || undefined}
          >
            <svg className={styles.ball} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
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
        className={styles.count}
        aria-hidden="true"
        data-poke-lounge-opponent-party-count="true"
      >
        {desktop ? <small className={styles.label}>{text.remaining}</small> : null}
        <strong>
          {summary.remaining}/{summary.total}
        </strong>
      </span>
    </div>
  );
}
