export interface RuntimeAnimation {
  stop(): void;
}

export function animateRuntimeValue({
  duration,
  ease = "linear",
  from = 0,
  onComplete,
  onUpdate,
  to = 1,
}: {
  duration: number;
  ease?: "cubic-out" | "linear" | "sine-out";
  from?: number;
  onComplete?(): void;
  onUpdate(value: number): void;
  to?: number;
}): RuntimeAnimation {
  let animationFrame = 0;
  let stopped = false;
  const startedAt = performance.now();
  const tick = (now: number) => {
    if (stopped) return;
    const progress = Math.min(1, Math.max(0, (now - startedAt) / Math.max(1, duration)));
    const eased = easeProgress(progress, ease);
    onUpdate(from + (to - from) * eased);
    if (progress < 1) {
      animationFrame = requestAnimationFrame(tick);
      return;
    }
    stopped = true;
    onComplete?.();
  };
  animationFrame = requestAnimationFrame(tick);
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(animationFrame);
    },
  };
}

export function scheduleRuntimeTask(delayMs: number, task: () => void): RuntimeAnimation {
  let stopped = false;
  const timeout = window.setTimeout(() => {
    if (stopped) return;
    stopped = true;
    task();
  }, delayMs);
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      window.clearTimeout(timeout);
    },
  };
}

export function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function easeProgress(progress: number, ease: "cubic-out" | "linear" | "sine-out"): number {
  if (ease === "cubic-out") return 1 - (1 - progress) ** 3;
  if (ease === "sine-out") return Math.sin((progress * Math.PI) / 2);
  return progress;
}
