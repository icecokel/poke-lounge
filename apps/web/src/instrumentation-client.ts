import { installClientDiagnostics } from "@/components/client-diagnostics-listener";

// Next loads this before hydration, so an app chunk failure can still be reported.
try {
  installClientDiagnostics();
} catch {
  // Diagnostics must not prevent the application from booting.
}
