"use client";

import { useEffect } from "react";
import { reportClientDiagnostic } from "@/lib/client-diagnostics";

export function ClientDiagnosticsListener() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      let script: string | undefined;
      try {
        const path = new URL(event.filename).pathname;
        if (path.startsWith("/_next/static/") && /^\/[A-Za-z0-9_./-]{1,200}$/.test(path)) {
          script = path;
        }
      } catch {}
      reportClientDiagnostic({
        kind: "runtime",
        code: event.error instanceof Error ? event.error.name : "WindowError",
        error: event.error ?? event.message,
        line: event.lineno || undefined,
        column: event.colno || undefined,
        script,
      });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      reportClientDiagnostic({
        kind: "rejection",
        code: event.reason instanceof Error ? event.reason.name : "UnhandledRejection",
        error: event.reason,
      });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
