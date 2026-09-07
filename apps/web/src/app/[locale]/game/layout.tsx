import type { Metadata } from "next";
import { getLocalizedPageMetadata } from "@/lib/seo/localized-metadata";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return getLocalizedPageMetadata((await params).locale, "intro");
}

export default function GameIntroLayout({ children }: Props) {
  return children;
}
