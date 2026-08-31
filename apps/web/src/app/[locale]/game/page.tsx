"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function GamePage() {
  const t = useTranslations("Game");

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
      <section className="flex max-w-lg flex-col items-center gap-5 text-center">
        <h1 className="text-4xl font-black tracking-tight">Poke Lounge</h1>
        <p className="text-slate-300">{t("pokeLoungeDesc")}</p>
        <Link
          href="/game/poke-lounge"
          className="rounded-lg bg-emerald-400 px-5 py-3 font-bold text-slate-950"
        >
          {t("playNow")}
        </Link>
      </section>
    </main>
  );
}
