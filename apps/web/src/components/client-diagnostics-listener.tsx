import {
  clientDiagnosticErrorName,
  reportClientDiagnostic,
  recordClientBreadcrumb,
  resumeClientDiagnostics,
  flushClientDiagnostics,
} from "@/lib/client-diagnostics";

export function installClientDiagnostics() {
  // Instrumentation can be re-evaluated by development hot reload.
  const owner = window as Window & { __pokeDiagnosticCleanup?: () => void };
  owner.__pokeDiagnosticCleanup?.();
  const onError = (event: Event) => {
    if (!(event instanceof ErrorEvent)) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const source =
        target instanceof HTMLImageElement || target instanceof HTMLMediaElement
          ? target.currentSrc || target.src
          : target instanceof HTMLScriptElement
            ? target.src
            : target instanceof HTMLLinkElement
              ? target.href
              : undefined;
      if (!source) return;
      try {
        const url = new URL(source, window.location.href);
        if (
          url.origin !== window.location.origin ||
          url.pathname.includes("..") ||
          !/^\/(?:_next\/static|assets|game-data)\/[A-Za-z0-9_./-]{1,180}$/.test(url.pathname)
        )
          return;
        recordClientBreadcrumb("resource.failed");
        reportClientDiagnostic({
          kind: "runtime",
          code: `RESOURCE_${target.tagName}_FAILED`,
          script: url.pathname.startsWith("/_next/static/") ? url.pathname : undefined,
          resourcePath: url.pathname.startsWith("/_next/") ? undefined : url.pathname,
        });
      } catch {}
      return;
    }
    let script: string | undefined;
    try {
      const path = new URL(event.filename).pathname;
      if (path.startsWith("/_next/static/") && /^\/[A-Za-z0-9_./-]{1,200}$/.test(path)) {
        script = path;
      }
    } catch {}
    reportClientDiagnostic({
      kind: "runtime",
      code: clientDiagnosticErrorName(event.error) ?? "WindowError",
      error: event.error ?? event.message,
      line: event.lineno || undefined,
      column: event.colno || undefined,
      script,
    });
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    reportClientDiagnostic({
      kind: "rejection",
      code: clientDiagnosticErrorName(event.reason) ?? "UnhandledRejection",
      error: event.reason,
    });
  };
  const onPageShow = (event: PageTransitionEvent) => {
    recordClientBreadcrumb(event.persisted ? "page.restored" : "page.shown");
    resumeClientDiagnostics();
    if (event.persisted)
      reportClientDiagnostic({ kind: "runtime", code: "PAGE_RESTORED", priority: "background" });
  };
  const onPageHide = (event: PageTransitionEvent) => {
    recordClientBreadcrumb(event.persisted ? "page.cached" : "page.leaving");
    reportClientDiagnostic({ kind: "runtime", code: "PAGE_HIDDEN", priority: "background" });
    flushClientDiagnostics();
  };
  const onHistory = () => {
    recordClientBreadcrumb("navigation.history");
    reportClientDiagnostic({ kind: "runtime", code: "HISTORY_NAVIGATION", priority: "background" });
  };
  const onVisibility = () => {
    recordClientBreadcrumb(document.visibilityState === "visible" ? "page.visible" : "page.hidden");
    if (document.visibilityState === "visible") resumeClientDiagnostics();
    else flushClientDiagnostics();
  };
  const onOnline = () => {
    recordClientBreadcrumb("network.online");
    resumeClientDiagnostics();
  };
  const onOffline = () => {
    recordClientBreadcrumb("network.offline");
    flushClientDiagnostics();
  };
  recordClientBreadcrumb("diagnostics.started");
  resumeClientDiagnostics();
  window.addEventListener("pageshow", onPageShow);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("popstate", onHistory);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("error", onError, true);
  window.addEventListener("unhandledrejection", onRejection);
  owner.__pokeDiagnosticCleanup = () => {
    window.removeEventListener("pageshow", onPageShow);
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("popstate", onHistory);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("error", onError, true);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
