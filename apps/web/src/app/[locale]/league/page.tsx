import { LeagueAppLoader } from "@/features/league/shell/league-app-loader";
import styles from "@/features/league/shell/league-frame.module.css";
import type { PokeLoungeLocale } from "@/components/poke-lounge/poke-lounge-copy";
import { RoomMenuHeader } from "@/components/poke-lounge/ui/room-menu-header";
import { getLeagueCopy } from "@/features/league/shell/copy";

export default async function LeaguePage({
  params,
}: {
  params: Promise<{ locale: PokeLoungeLocale }>;
}) {
  const { locale } = await params;
  return (
    <main className={styles.page}>
      <div className={styles.frame}>
        <RoomMenuHeader locale={locale} className={styles.header}>
          <a href={`/${locale}/game/poke-lounge`}>{getLeagueCopy(locale).firstScreen}</a>
        </RoomMenuHeader>
        <LeagueAppLoader locale={locale} />
      </div>
    </main>
  );
}
