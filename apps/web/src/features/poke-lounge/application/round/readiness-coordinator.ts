/** DOM and React report facts; this coordinator owns the once-per-round acknowledgement. */
export interface ReadinessObservation {
  key: string | null;
  roundIndex: number;
  rendered: boolean;
}
export type ReadinessStatus = "idle" | "sending" | "ready" | "failed";
export interface ReadinessPorts {
  submit(roundIndex: number): Promise<void>;
  onStatus(status: ReadinessStatus): void;
}
export function createReadinessCoordinator(ports: ReadinessPorts) {
  let key: string | null = null;
  let generation = 0;
  let frames = 0;
  let status: ReadinessStatus = "idle";
  let disposed = false;
  const setStatus = (next: ReadinessStatus) => {
    if (next === status) return;
    status = next;
    ports.onStatus(next);
  };
  return {
    observe(observation: ReadinessObservation): void {
      if (disposed) return;
      if (observation.key !== key) {
        key = observation.key;
        generation += 1;
        frames = 0;
        setStatus("idle");
      }
      if (key === null || status !== "idle") return;
      frames = observation.rendered ? frames + 1 : 0;
      if (frames < 2) return;
      const attempt = generation;
      setStatus("sending");
      // Handle synchronous throws as well as rejected network promises.
      void Promise.resolve()
        .then(() => {
          if (disposed || attempt !== generation) return;
          return ports.submit(observation.roundIndex);
        })
        .then(
          () => {
            if (!disposed && attempt === generation) setStatus("ready");
          },
          () => {
            if (!disposed && attempt === generation) setStatus("failed");
          },
        );
    },
    retry(): void {
      if (disposed || status !== "failed") return;
      frames = 0;
      generation += 1;
      setStatus("idle");
    },
    dispose(): void {
      disposed = true;
      generation += 1;
    },
  };
}
