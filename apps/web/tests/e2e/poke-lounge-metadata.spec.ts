import { expect, test } from "@playwright/test";
import ko from "../../messages/ko-KR.json";
import en from "../../messages/en-US.json";
import ja from "../../messages/ja-JP.json";

const siteOrigin = "https://poke-lounge.icecoke.kr";
const messages = { "ko-KR": ko, "en-US": en, "ja-JP": ja };
const locales = ["ko-KR", "en-US", "ja-JP"] as const;
const crawlers = {
  "카카오 단독": "kakaotalk-scrap/1.0",
  "카카오 복합": "facebookexternalhit/1.1; kakaotalk-scrap/1.0",
  "카카오스토리 단독": "kakaostory-og-reader/1.0",
  Facebook: "facebookexternalhit/1.1",
  Twitter: "Twitterbot/1.0",
  Discord: "Discordbot/2.0",
};
function decode(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
function attributes(tag: string): Record<string, string> {
  return Object.fromEntries(
    [...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(match => [
      match[1]!.toLowerCase(),
      decode(match[2] ?? match[3] ?? ""),
    ]),
  );
}
function readHead(html: string) {
  // Raw response only: browsers can hoist body metadata into head and hide this regression.
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1];
  expect(head, "Metadata must exist in the initial server head, without JavaScript").toBeDefined();
  const clean = head!.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  const meta = [...clean.matchAll(/<meta\b[^>]*>/gi)].map(match => attributes(match[0]));
  const links = [...clean.matchAll(/<link\b[^>]*>/gi)].map(match => attributes(match[0]));
  return {
    value(key: string): string | undefined {
      const found = meta.filter(tag => tag.property === key || tag.name === key);
      expect(found, `Exactly one ${key} must be present in head`).toHaveLength(1);
      return found[0]!.content;
    },
    links,
    localeAlternates: meta
      .filter(tag => tag.property === "og:locale:alternate")
      .map(tag => tag.content),
  };
}
for (const locale of locales) {
  for (const route of ["/game", "/game/poke-lounge"] as const) {
    for (const [crawler, userAgent] of Object.entries(crawlers)) {
      test(`공유 메타데이터 ${locale}${route} · ${crawler}`, async ({ request }) => {
        const pathname = `/${locale}${route}`;
        const response = await request.get(pathname, {
          headers: { "user-agent": userAgent, "accept-language": "en-US,en;q=0.9", accept: "*/*" },
        });
        expect(response.status()).toBe(200);
        const head = readHead(await response.text());
        expect(head.value("og:title")).toBe("Poke Lounge");
        expect(head.value("og:site_name")).toBe("Poke Lounge");
        expect(head.value("og:type")).toBe("website");
        expect(head.value("og:description")).toBe(messages[locale].Game.pokeLoungeShareDesc);
        expect(head.value("description")).toBe(messages[locale].Game.pokeLoungeShareDesc);
        expect(head.value("og:url")).toBe(`${siteOrigin}${pathname}`);
        expect(head.value("og:locale")).toBe(locale.replace("-", "_"));
        expect(head.localeAlternates).toEqual(
          locales
            .filter(candidate => candidate !== locale)
            .map(candidate => candidate.replace("-", "_")),
        );
        expect(head.value("og:image")).toBe(`${siteOrigin}/og-image.png`);
        expect(head.value("og:image:width")).toBe("1200");
        expect(head.value("og:image:height")).toBe("630");
        expect(head.value("og:image:type")).toBe("image/png");
        expect(head.value("og:image:alt")).toBe("Poke Lounge");
        expect(head.value("twitter:card")).toBe("summary_large_image");
        expect(head.value("twitter:title")).toBe("Poke Lounge");
        expect(head.value("twitter:description")).toBe(messages[locale].Game.pokeLoungeShareDesc);
        expect(head.value("twitter:image")).toBe(`${siteOrigin}/og-image.png`);
        expect(head.links.filter(link => link.rel === "canonical").map(link => link.href)).toEqual([
          `${siteOrigin}${pathname}`,
        ]);
        for (const candidate of locales) {
          expect(head.links).toContainEqual({
            rel: "alternate",
            hreflang: candidate,
            href: `${siteOrigin}/${candidate}${route}`,
          });
        }
        expect(head.links).toContainEqual({
          rel: "alternate",
          hreflang: "x-default",
          href: `${siteOrigin}/ko-KR${route}`,
        });
      });
    }
  }
}

test("공유 메타데이터는 합성 방 쿼리와 유입 파라미터를 대표 URL에 넣지 않는다", async ({
  request,
}) => {
  const response = await request.get(
    "/ko-KR/game/poke-lounge?network=server&room=OG_TEST_NOT_REAL&utm_source=og-test",
    { headers: { "user-agent": crawlers["카카오 단독"] } },
  );
  expect(response.status()).toBe(200);
  const head = readHead(await response.text());
  expect(head.value("og:url")).toBe(`${siteOrigin}/ko-KR/game/poke-lounge`);
  expect(head.links.filter(link => link.rel === "canonical").map(link => link.href)).toEqual([
    `${siteOrigin}/ko-KR/game/poke-lounge`,
  ]);
});

test("OG PNG는 로그인 없이 접근할 수 있고 선언된 1200×630과 일치한다", async ({ request }) => {
  const response = await request.get("/og-image.png", {
    headers: { "user-agent": crawlers["카카오 단독"] },
  });
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("image/png");
  const png = await response.body();
  expect(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).toBe(true);
  expect(png.readUInt32BE(16)).toBe(1200);
  expect(png.readUInt32BE(20)).toBe(630);
});

test("사이트 루트 공유는 리다이렉트 이후에도 한국어 게임 OG를 제공한다", async ({ request }) => {
  const response = await request.get("/", {
    headers: { "user-agent": crawlers["카카오 단독"], "accept-language": "ko-KR" },
  });
  expect(response.status()).toBe(200);
  expect(new URL(response.url()).pathname).toBe("/ko-KR/game/poke-lounge");
  expect(readHead(await response.text()).value("og:url")).toBe(
    `${siteOrigin}/ko-KR/game/poke-lounge`,
  );
});
