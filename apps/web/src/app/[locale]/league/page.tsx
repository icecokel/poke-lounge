import { LeagueAppLoader } from "@/features/league/shell/league-app-loader";
import styles from "@/features/league/shell/league-frame.module.css";
import type { PokeLoungeLocale } from "@/components/poke-lounge/poke-lounge-copy";

export default async function LeaguePage({
  params,
}: {
  params: Promise<{ locale: PokeLoungeLocale }>;
}) {
  const { locale } = await params;
  return (
    <main className={styles.page}>
      <LeagueAppLoader locale={locale} />
    </main>
  );
}
