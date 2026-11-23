import type { Metadata } from "next";
import { getLocalizedPageMetadata } from "@/lib/seo/localized-metadata";
import { GAME_VIEWPORT } from "@/lib/viewport/game-viewport";

export const viewport = GAME_VIEWPORT;

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return getLocalizedPageMetadata((await params).locale, "game");
}

export default function PokeLoungeLayout({ children }: Props) {
  return children;
}
