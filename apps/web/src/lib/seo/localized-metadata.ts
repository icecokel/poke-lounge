import { getTranslations } from "next-intl/server";
import {
  createPokeLoungeMetadata,
  resolveMetadataLocale,
  type MetadataPage,
} from "./page-metadata";

export async function getLocalizedPageMetadata(requestedLocale: string, page: MetadataPage) {
  const locale = resolveMetadataLocale(requestedLocale);
  const t = await getTranslations({ locale, namespace: "Game" });
  return createPokeLoungeMetadata({ locale, page, description: t("pokeLoungeShareDesc") });
}
