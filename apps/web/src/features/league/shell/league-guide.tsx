import Image from "next/image";
import type { ReactNode } from "react";
import type { LeagueLocale } from "../contract";
import { leagueText } from "./copy";
import styles from "./league-frame.module.css";
import entry from "@/components/poke-lounge/runtime/game/ui/trainer-name-entry.module.css";

/** The lounge guide at the league front desk, with one dialogue box under the scene. */
export function LeagueGuide({
  locale,
  lead,
  line,
}: {
  locale: LeagueLocale;
  lead?: ReactNode;
  line: ReactNode;
}) {
  const label = leagueText(locale, "라운지 안내원", "Lounge guide", "ラウンジ案内人");
  return (
    <>
      <div className={`${entry.scene} ${styles.scene}`}>
        <div className={entry.horizon} aria-hidden="true" />
        <div className={styles.portrait}>
          <Image
            src="/assets/poke-lounge/lounge-guide.png"
            alt={label}
            width={256}
            height={256}
            priority
            unoptimized
            className={entry.guide}
          />
        </div>
        <span className={entry.guideLabel}>{label}</span>
      </div>
      <div className={`${entry.dialogue} ${styles.dialogue}`} aria-live="polite">
        {lead ? <p>{lead}</p> : null}
        <h2>{line}</h2>
        <span className={entry.advance} aria-hidden="true">
          ▼
        </span>
      </div>
    </>
  );
}
