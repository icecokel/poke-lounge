import type { LeagueLocale } from "../contract";
import { getLeagueCopy } from "./copy";
import { getGuideCopy } from "./guide-copy";
import { LeagueGuide, LeagueGuideScene } from "./league-guide";
import styles from "./league-frame.module.css";

export function LeagueBootPanel({ locale }: { locale: LeagueLocale }) {
  const text = getLeagueCopy(locale);
  return (
    <>
      <LeagueGuide lead={getGuideCopy(locale).welcome} line={text.loading} />
      <div className={styles.content}>
        <section className={`${styles.panel} ${styles.menuPanel}`} role="status">
          <h2 className={styles.panelTitle}>{text.title}</h2>
          <p className={styles.meta}>{text.loading}</p>
        </section>
      </div>
    </>
  );
}

export function LeagueLoading({ locale }: { locale: LeagueLocale }) {
  return (
    <div className={`${styles.body} ${styles.reception}`}>
      <LeagueGuideScene locale={locale} />
      <LeagueBootPanel locale={locale} />
    </div>
  );
}
