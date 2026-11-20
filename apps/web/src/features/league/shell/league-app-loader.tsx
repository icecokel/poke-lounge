"use client";

import dynamic from "next/dynamic";
import { useLocale } from "next-intl";
import type { LeagueLocale } from "../contract";
import { LeagueLoading } from "./league-loading";

export const LeagueAppLoader = dynamic(() => import("./league-app"), {
  ssr: false,
  loading: function Loading() {
    return <LeagueLoading locale={useLocale() as LeagueLocale} />;
  },
});
