"use client";

import { useEffect } from "react";
import { reportClientDiagnostic } from "@/lib/client-diagnostics";

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
    });
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <p role="alert">화면을 표시하는 중 오류가 발생했습니다.</p>
      <button type="button" onClick={reset} className="rounded border px-4 py-2">
        다시 시도
      </button>
    </main>
  );
}
