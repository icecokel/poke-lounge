"use client";

import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

const PokeLoungeLoadingScreen = () => {
  const locale = useLocale();
  const t = useTranslations("Game");

  return (
    <main
      className="flex min-h-[100dvh] w-full items-center justify-center bg-[#17201a] px-4 text-[#f8fbf0]"
      data-testid="poke-lounge-loading-screen"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-sm font-semibold tracking-wide">{t("pokeLoungeLoading")}</p>
        <Button asChild variant="outline">
          <a href={`/${locale}/intro`} data-testid="poke-lounge-loading-exit">
            {t("backToGame")}
          </a>
        </Button>
      </div>
    </main>
  );
};

const PokeLoungeGame = dynamic(
  function callback() {
    return import("@/components/poke-lounge/poke-lounge-game").then(function handleResolved(mod) {
      return mod.PokeLoungeGame;
    });
  },
  {
    ssr: false,
    loading: PokeLoungeLoadingScreen,
  },
);

export default function PokeLoungePage() {
  return (
    <div className="min-h-[100dvh] bg-[#17201a]">
      <PokeLoungeGame />
    </div>
  );
}
