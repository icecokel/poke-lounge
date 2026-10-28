import { DiscordAccountButton } from "@/components/poke-lounge/ui/discord-account-button";
import type { PokeLoungeLocale } from "@/components/poke-lounge/poke-lounge-copy";

const titles = { "ko-KR": "리그", "en-US": "League", "ja-JP": "リーグ" };

export default async function LeaguePage({
  params,
}: {
  params: Promise<{ locale: PokeLoungeLocale }>;
}) {
  const { locale } = await params;

  return (
    <main className="bg-background text-foreground flex min-h-dvh items-center justify-center px-4 py-12">
      <section className="bg-card text-card-foreground border-border grid w-full max-w-md gap-6 rounded-xl border p-6 shadow-sm">
        <h1 className="text-2xl font-bold">{titles[locale]}</h1>
        <DiscordAccountButton locale={locale} />
      </section>
    </main>
  );
}
