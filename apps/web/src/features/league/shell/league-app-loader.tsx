"use client";

import dynamic from "next/dynamic";

export const LeagueAppLoader = dynamic(() => import("./league-app"), { ssr: false });
