import { LeagueAppLoader } from "@/features/league/shell/league-app-loader";
import type { PokeLoungeLocale } from "@/components/poke-lounge/poke-lounge-copy";

const titles = { "ko-KR": "리그", "en-US": "League", "ja-JP": "リーグ" };
const back = { "ko-KR": "첫 화면으로", "en-US": "Back to start", "ja-JP": "最初の画面へ" };

export default async function LeaguePage({
  params,
}: {
  params: Promise<{ locale: PokeLoungeLocale }>;
}) {
  const { locale } = await params;
  return (
    <main className="bg-background text-foreground min-h-dvh px-4 py-10">
      <section className="bg-card border-border mx-auto grid w-full max-w-4xl gap-6 rounded-xl border p-5 sm:p-8">
        <header className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">{titles[locale]}</h1>
          <a href={`/${locale}/game/poke-lounge`} className="underline">
            {back[locale]}
          </a>
        </header>
        <LeagueAppLoader locale={locale} />
      </section>
    </main>
  );
}
