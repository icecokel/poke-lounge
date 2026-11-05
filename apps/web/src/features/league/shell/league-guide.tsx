import Image from "next/image";
import type { ReactNode } from "react";
import type { LeagueLocale } from "../contract";
import { leagueText } from "./copy";
import styles from "./league-frame.module.css";

/** The lounge guide at the league front desk, with one dialogue box under the scene. */
export function LeagueGuide({
  locale,
  lead,
  line,
  compact = false,
}: {
  locale: LeagueLocale;
  lead?: ReactNode;
  line: ReactNode;
  compact?: boolean;
}) {
  const label = leagueText(locale, "라운지 안내원", "Lounge guide", "ラウンジ案内人");
  return (
    <>
      <div className={compact ? `${styles.scene} ${styles.compact}` : styles.scene}>
        <div className={styles.horizon} aria-hidden="true" />
        <div className={styles.pennants} aria-hidden="true" />
        <Image
          src="/assets/poke-lounge/lounge-guide.png"
          alt={label}
          width={256}
          height={256}
          priority
          unoptimized
          className={styles.guide}
        />
        <span className={styles.guideLabel}>{label}</span>
      </div>
      <div className={styles.dialogue} aria-live="polite">
        {lead ? <p>{lead}</p> : null}
        <h2>{line}</h2>
        <span className={styles.advance} aria-hidden="true">
          ▼
        </span>
      </div>
    </>
  );
}
