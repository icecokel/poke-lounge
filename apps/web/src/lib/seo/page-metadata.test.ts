import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ko from "../../../messages/ko-KR.json";
import en from "../../../messages/en-US.json";
import ja from "../../../messages/ja-JP.json";
import { routing } from "../../i18n/routing";
import {
  createPokeLoungeMetadata,
  POKE_LOUNGE_SITE_ORIGIN,
  resolveMetadataLocale,
} from "./page-metadata";

const descriptions = { "ko-KR": ko, "en-US": en, "ja-JP": ja };
for (const locale of routing.locales) {
  for (const page of ["intro", "game"] as const) {
    test(`${locale} ${page}: canonical·OG·언어별 경로·Twitter·서비스명을 같은 원본에서 생성한다`, () => {
      const description = descriptions[locale].Game.pokeLoungeShareDesc;
      const metadata = createPokeLoungeMetadata({ locale, page, description });
      const suffix = page === "intro" ? "/game" : "/game/poke-lounge";
      assert.equal(metadata.metadataBase.href, POKE_LOUNGE_SITE_ORIGIN + "/");
      assert.equal(metadata.alternates!.canonical, `/${locale}${suffix}`);
      assert.equal(metadata.openGraph.url, metadata.alternates!.canonical);
      assert.equal(metadata.openGraph.locale, locale.replace("-", "_"));
      assert.deepEqual(
        metadata.openGraph.alternateLocale,
        routing.locales.filter(l => l !== locale).map(l => l.replace("-", "_")),
      );
      for (const candidate of routing.locales)
        assert.equal(metadata.alternates!.languages[candidate], `/${candidate}${suffix}`);
      assert.equal(metadata.alternates!.languages["x-default"], `/ko-KR${suffix}`);
      assert.equal(metadata.openGraph.siteName, "Poke Lounge");
      assert.equal(metadata.openGraph.type, "website");
      assert.equal(metadata.twitter.card, "summary_large_image");
      assert.equal(metadata.description, description);
      assert.equal(metadata.openGraph.description, description);
      assert.equal(metadata.twitter.description, description);
      assert.equal(metadata.openGraph.images[0]!.url, metadata.twitter.images[0]!.url);
      assert.equal(
        new URL(metadata.openGraph.images[0]!.url, metadata.metadataBase).href,
        `${POKE_LOUNGE_SITE_ORIGIN}/og-image.png`,
      );
      assert.ok(description.length > 40);
    });
  }
}

test("잘못된 로케일과 쿼리/host 문자열을 경로에 섞지 않는다", () => {
  for (const input of ["", "fr-FR", "ko-KR?room=secret", "//attacker.invalid", "../../"]) {
    assert.equal(resolveMetadataLocale(input), "ko-KR");
  }
  for (const input of routing.locales) assert.equal(resolveMetadataLocale(input), input);
});

test("루트 fallback은 소개 페이지 canonical을 임의로 상속하지 않는다", () => {
  const metadata = createPokeLoungeMetadata({
    locale: "ko-KR",
    page: "root",
    description: "fallback",
  });
  assert.equal(metadata.alternates, undefined);
  assert.equal(metadata.openGraph.url, "/");
});

test("요청 간 공유 배열/URL 객체를 변경하지 않는다", () => {
  const options = { locale: "ko-KR", page: "intro", description: "test" } as const;
  const first = createPokeLoungeMetadata(options);
  first.metadataBase.hostname = "attacker.invalid";
  first.openGraph.images[0]!.url = "/replaced.png";
  const second = createPokeLoungeMetadata(options);
  assert.equal(second.metadataBase.origin, POKE_LOUNGE_SITE_ORIGIN);
  assert.equal(second.openGraph.images[0]!.url, "/og-image.png");
});

test("메타 이미지 크기와 형식은 실제 public PNG와 일치한다", () => {
  const png = readFileSync(new URL("../../../public/og-image.png", import.meta.url));
  const image = createPokeLoungeMetadata({ locale: "ko-KR", page: "game", description: "test" })
    .openGraph.images[0]!;
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(png.readUInt32BE(16), image.width);
  assert.equal(png.readUInt32BE(20), image.height);
  assert.equal(image.type, "image/png");
});
