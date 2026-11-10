"use client";

import { useEffect } from "react";
import { reportClientDiagnostic } from "@/lib/client-diagnostics";

// This boundary renders above NextIntlClientProvider, so it cannot use next-intl messages.
const ERROR_COPY = {
  "ko-KR": { message: "화면을 표시하는 중 오류가 발생했습니다.", retry: "다시 시도" },
  "en-US": { message: "Something went wrong while displaying this screen.", retry: "Try again" },
  "ja-JP": { message: "画面の表示中にエラーが発生しました。", retry: "もう一度試す" },
} as const;

function getErrorCopy() {
  const segment = typeof window === "undefined" ? "" : window.location.pathname.split("/")[1];
  return segment === "en-US" || segment === "ja-JP" ? ERROR_COPY[segment] : ERROR_COPY["ko-KR"];
}

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientDiagnostic({
      kind: "runtime",
      code:
        error.digest && /^[A-Za-z0-9_-]{1,40}$/.test(error.digest)
          ? `RENDER_${error.digest}`
          : "RENDER_ERROR",
      error,
    });
  }, [error]);

  const copy = getErrorCopy();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <p role="alert">{copy.message}</p>
      <button type="button" onClick={reset} className="rounded border px-4 py-2">
        {copy.retry}
      </button>
    </main>
  );
}
