export interface RuntimeAnimation {
  stop(): void;
}

type RuntimeFrameTick = (now: number) => void;

// Every running animation shares one requestAnimationFrame callback, so a scene can
// publish the combined result of all of them once per frame (see scheduleRuntimeFrameEnd).
const frameTicks = new Set<RuntimeFrameTick>();
let frameEndTasks: Array<() => void> = [];
let frameHandle: number | null = null;

function requestRuntimeFrame(): void {
  if (frameHandle !== null) return;
  frameHandle = requestAnimationFrame(runRuntimeFrame);
}

function runRuntimeFrame(now: number): void {
  frameHandle = null;
  const errors: unknown[] = [];
  // Animations started during this frame take their first step on the next one.
  for (const tick of Array.from(frameTicks)) {
    if (!frameTicks.has(tick)) continue;
    try {
      tick(now);
    } catch (error) {
      // One failing animation must not freeze the others.
      frameTicks.delete(tick);
      errors.push(error);
    }
  }
  // A task scheduled while these run waits for the next frame.
  const tasks = frameEndTasks;
  frameEndTasks = [];
  for (const task of tasks) {
    try {
      task();
    } catch (error) {
      errors.push(error);
    }
  }
  if (frameTicks.size > 0) requestRuntimeFrame();
  for (const error of errors) {
    queueMicrotask(() => {
      throw error;
    });
  }
}

/**
 * Runs the task once, after every animation has stepped in the current (or next)
 * animation frame. Like the animations themselves it waits while the tab is hidden.
 */
export function scheduleRuntimeFrameEnd(task: () => void): void {
  frameEndTasks.push(task);
  requestRuntimeFrame();
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
  let stopped = false;
  const startedAt = performance.now();
  const tick = (now: number) => {
    if (stopped) return;
    const progress = Math.min(1, Math.max(0, (now - startedAt) / Math.max(1, duration)));
    const eased = easeProgress(progress, ease);
    onUpdate(from + (to - from) * eased);
    if (progress < 1) return;
    stopped = true;
    frameTicks.delete(tick);
    onComplete?.();
  };
  frameTicks.add(tick);
  requestRuntimeFrame();
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      frameTicks.delete(tick);
    },
  };
}

export function scheduleRuntimeTask(delayMs: number, task: () => void): RuntimeAnimation {
  let stopped = false;
  const timeout = window.setTimeout(function handleTimeout() {
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
