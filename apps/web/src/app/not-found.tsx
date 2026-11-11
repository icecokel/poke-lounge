import { getLocale } from "next-intl/server";

const NOT_FOUND_COPY = {
  "ko-KR": { message: "페이지를 찾을 수 없습니다.", home: "게임 로비로" },
  "en-US": { message: "This page could not be found.", home: "Game lobby" },
  "ja-JP": { message: "ページが見つかりません。", home: "ゲームロビーへ" },
} as const;

export default async function NotFound() {
  const requestedLocale = await getLocale();
  const locale =
    requestedLocale === "en-US" || requestedLocale === "ja-JP" ? requestedLocale : "ko-KR";
  const copy = NOT_FOUND_COPY[locale];

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <h1>404</h1>
      <p role="alert">{copy.message}</p>
      <a href={`/${locale}`} className="rounded border px-4 py-2">
        {copy.home}
      </a>
    </main>
  );
}
