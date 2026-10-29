import { LeagueAppLoader } from "@/features/league/shell/league-app-loader";
import type { PokeLoungeLocale } from "@/components/poke-lounge/poke-lounge-copy";

export default async function LeaguePage({
  params,
}: {
  params: Promise<{ locale: PokeLoungeLocale }>;
}) {
  const { locale } = await params;

  return <LeagueAppLoader locale={locale} />;
}
