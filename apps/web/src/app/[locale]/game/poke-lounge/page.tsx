"use client";

import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

const PokeLoungeLoadingScreen = () => {
  const locale = useLocale();
  const t = useTranslations("Game");

  return (
    <main
      className="flex min-h-screen w-full items-center justify-center bg-slate-950 px-4 text-white"
      data-testid="poke-lounge-loading-screen"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-sm font-semibold tracking-wide">{t("pokeLoungeLoading")}</p>
        <Button asChild variant="outline">
          <a href={`/${locale}/game`} data-testid="poke-lounge-loading-exit">
            {t("backToGame")}
          </a>
        </Button>
      </div>
    </main>
  );
};

const PokeLoungeGame = dynamic(
  () => import("@/components/poke-lounge/poke-lounge-game").then(mod => mod.PokeLoungeGame),
  {
    ssr: false,
    loading: PokeLoungeLoadingScreen,
  },
);

export default function PokeLoungePage() {
  return <PokeLoungeGame />;
}
