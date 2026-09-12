import {
  BATTLE_STATUS_EFFECT_DURATION_MS,
  BATTLE_SPECIAL_EFFECT_DURATION_MS,
  BATTLE_DEFAULT_EFFECT_DURATION_MS,
} from "@poke-lounge/battle/timing";
import generated from "./move-animations.generated.json";
import type { BattleAnimationCue } from "@poke-lounge/battle/battle-presentation";
export type { BattleAnimationCue } from "@poke-lounge/battle/battle-presentation";
export type EffectSide = "player" | "opponent";
export interface EffectPoint {
  x: number;
  y: number;
}
export interface AnimationProfile {
  emit: { resource: string; target: number; at: number }[];
  shake: number;
  shakeCount: number;
  tint: number | null;
  slide: number[] | null;
  windup: string;
  functions: number[];
  scriptBytes: number;
}
export interface AnimationEmitter {
  frames: number[];
  count: number;
  radius: number;
  scale: number;
  aspect: number;
  delay: number;
  emitterLife: number;
  life: number;
  interval: number;
  alpha: number;
  rotation: number;
  velocity: number;
  scaleCurve: number[];
  alphaCurve: number[];
  textureStep: number;
  emission: number;
  rotate: boolean;
  gravity: boolean;
}
export const MOVE_ANIMATION_CATALOG: {
  version: number;
  source: typeof generated.source;
  atlasSize: number;
  frames: { page: number; x: number; y: number; width: number; height: number }[];
  emitters: Record<string, AnimationEmitter>;
  moves: Record<string, AnimationProfile>;
  statuses: Record<string, AnimationProfile>;
  fallback: AnimationProfile;
} = generated;
export interface ActiveBattleEffect {
  key: number;
  cue: BattleAnimationCue;
  progress: number;
}
export function getMoveAnimationProfile(cue: BattleAnimationCue): AnimationProfile {
  return (
    (cue.kind === "status"
      ? MOVE_ANIMATION_CATALOG.statuses[cue.status]
      : MOVE_ANIMATION_CATALOG.moves[cue.moveId]) ?? MOVE_ANIMATION_CATALOG.fallback
  );
}
export function getBattleEffectTiming(cue: BattleAnimationCue) {
  const special = getMoveAnimationProfile(cue).windup !== "none";
  return cue.kind === "status"
    ? { durationMs: BATTLE_STATUS_EFFECT_DURATION_MS, impact: 0.1 }
    : special
      ? { durationMs: BATTLE_SPECIAL_EFFECT_DURATION_MS, impact: 0.52 }
      : { durationMs: BATTLE_DEFAULT_EFFECT_DURATION_MS, impact: 0.3 };
}
export function getEffectPhase(effect: ActiveBattleEffect): "windup" | "strike" | "recovery" {
  const { impact } = getBattleEffectTiming(effect.cue);
  return effect.progress < impact ? "windup" : effect.progress < 0.8 ? "strike" : "recovery";
}
const unit = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 1);
const mix = (a: number, b: number, p: number) => a + (b - a) * unit(p);
const curve = (values: number[], p: number) =>
  p < 0.5
    ? mix(values[0] ?? 1, values[1] ?? 1, p * 2)
    : mix(values[1] ?? 1, values[2] ?? 1, (p - 0.5) * 2);
export function getEffectActorMotion(
  effect: ActiveBattleEffect | null | undefined,
  side: EffectSide,
  origin: EffectPoint,
  target: EffectPoint,
  reducedMotion = false,
) {
  const neutral = { x: 0, y: 0, alpha: 1, scale: 1, rotation: 0, tint: null as string | null };
  if (!effect || reducedMotion || effect.progress >= 1 || effect.progress < 0) return neutral;
  const { cue } = effect,
    p = unit(effect.progress),
    profile = getMoveAnimationProfile(cue),
    timing = getBattleEffectTiming(cue);
  if (cue.source === side) {
    if (cue.kind === "status")
      return {
        ...neutral,
        x: cue.status === "paralyzed" ? Math.sin(p * Math.PI * 18) * 1.5 : 0,
        tint:
          cue.status === "poisoned" ? "#b568c7" : cue.status === "burned" ? "#f47d4c" : "#f6de72",
      };
    const kind = profile.windup;
    if (["air", "ground", "water", "shadow"].includes(kind)) {
      const displacement = kind === "air" ? -90 : kind === "shadow" ? 0 : 25;
      if (p < 0.23)
        return {
          ...neutral,
          y: displacement * unit(p / 0.23),
          alpha: 1 - unit((p - 0.14) / 0.09),
          scale: kind === "air" ? 1 : 1 - 0.55 * unit(p / 0.23),
        };
      if (p < 0.39) return { ...neutral, y: displacement, alpha: 0, scale: 0.45 };
      if (p < timing.impact) {
        const q = unit((p - 0.39) / (timing.impact - 0.39));
        return {
          ...neutral,
          x: (target.x - origin.x) * q * 0.82,
          y:
            (target.y - origin.y) * q +
            (kind === "air" ? -85 * (1 - q) : kind === "shadow" ? 0 : 28 * (1 - q)),
          alpha: q,
          scale: 0.55 + 0.45 * q,
        };
      }
      if (p < 0.76) {
        const q = unit((p - timing.impact) / (0.76 - timing.impact));
        return {
          ...neutral,
          x: (target.x - origin.x) * 0.82 * (1 - q),
          y: (target.y - origin.y) * (1 - q),
          alpha: 1,
        };
      }
      return neutral;
    }
    if (kind === "charge")
      return {
        ...neutral,
        scale: 1 + 0.07 * Math.sin(Math.PI * unit(p / timing.impact)),
        tint: p < timing.impact ? "#fff5a3" : null,
      };
    const lunge = Math.sin(Math.PI * unit(p / timing.impact));
    if (profile.slide)
      return {
        ...neutral,
        x: profile.slide[0]! * lunge * (side === "player" ? 1 : -1),
        y: profile.slide[1]! * lunge * (side === "player" ? 1 : -1),
      };
    // Native sprite-only callbacks (growl, tail whip, etc.) retain readable actor motion.
    return {
      ...neutral,
      scale: 1 + 0.035 * Math.sin(p * Math.PI * 2),
      rotation: profile.emit.length === 0 ? Math.sin(p * Math.PI * 4) * 4 : 0,
    };
  }
  if (
    side === cue.target &&
    cue.kind === "move" &&
    cue.hit &&
    cue.damage > 0 &&
    p >= timing.impact
  ) {
    const q = unit((p - timing.impact) / 0.3),
      strength = profile.shake || 2;
    const rgb =
      profile.tint === null
        ? null
        : `rgb(${[profile.tint & 31, (profile.tint >> 5) & 31, (profile.tint >> 10) & 31].map(c => Math.round((c * 255) / 31)).join(",")})`;
    return {
      ...neutral,
      x: Math.sin(q * Math.PI * 2 * Math.max(2, profile.shakeCount)) * strength * (1 - q),
      tint: q < 1 ? rgb : null,
    };
  }
  return neutral;
}
export interface EffectParticle {
  id: string;
  frame: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  alpha: number;
}

/** Original SPL textures, colors, scale/alpha curves and frame sequences; bounded 2D projection.
 * Particle motion intentionally uses no battle RNG and never changes the simulation state.
 */
export function getEffectParticles(
  effect: ActiveBattleEffect,
  origin: EffectPoint,
  target: EffectPoint,
  reducedMotion = false,
): EffectParticle[] {
  const profile = getMoveAnimationProfile(effect.cue),
    timing = getBattleEffectTiming(effect.cue);
  const progress = unit(effect.progress),
    elapsed = progress * timing.durationMs,
    particles: EffectParticle[] = [];
  if (progress >= 1) return particles;
  const maxParticles = reducedMotion ? 8 : 56;
  const perEmitter = Math.max(1, Math.floor(maxParticles / Math.max(1, profile.emit.length)));
  for (const [index, binding] of profile.emit.entries()) {
    const e = MOVE_ANIMATION_CATALOG.emitters[binding.resource];
    if (!e) continue;
    // IPKK Dig uses ANIM_TARGET_MISC (17), then native cmd37 relocates the
    // emitter to the attacker. Treating that location as a projectile sends
    // the digging dust to the defender before the attacker has emerged.
    const diggingDust = effect.cue.moveId === 91 && binding.target === 17;
    const atSource = binding.target === 3 || effect.cue.kind === "status" || diggingDust;
    const travel = binding.target === 17 && effect.cue.kind === "move" && !diggingDust;
    if (!atSource && !travel && !effect.cue.hit) continue;
    const count = Math.min(
      perEmitter,
      Math.max(1, Math.ceil((e.count * Math.max(1, e.emitterLife)) / Math.max(1, e.interval))),
    );
    const start =
      effect.cue.kind === "status"
        ? 0
        : atSource
          ? 0
          : travel
            ? timing.impact * timing.durationMs * 0.15
            : timing.impact * timing.durationMs;
    const delay = Math.min(140, ((binding.at + e.delay) * 1000) / 60);
    for (let n = 0; n < count; n++) {
      const born = start + delay + n * Math.min(45, Math.max(12, (e.interval * 1000) / 60));
      const life = Math.max(200, Math.min(720, (e.life * 1000) / 60));
      const age = (elapsed - born) / life;
      if (age < 0 || age >= 1) continue;
      const p = unit(age),
        angle = n * 2.399 + index * 1.7 + effect.cue.moveId * 0.13;
      const radius = Math.max(2, Math.min(26, e.radius * 6 + e.velocity * p * 8));
      let x = (atSource ? origin : target).x,
        y = (atSource ? origin : target).y;
      if (travel) {
        const q = unit(p * 1.8);
        x = mix(origin.x, target.x, q);
        y = mix(origin.y, target.y + (effect.cue.hit ? 0 : -32), q);
      }
      if (!reducedMotion) {
        x += Math.cos(angle) * radius * (0.2 + p);
        y += Math.sin(angle) * radius * 0.6 * (0.2 + p);
        if (effect.cue.kind === "status") y -= p * 24;
        else if (e.gravity) y += p * p * 20;
      }
      const frames = e.frames;
      const frame = frames[Math.min(frames.length - 1, Math.floor(p * frames.length))];
      if (frame === undefined) continue;
      const image = MOVE_ANIMATION_CATALOG.frames[frame];
      if (!image) continue;
      const scale = Math.max(0.2, Math.min(2.4, e.scale * curve(e.scaleCurve, p)));
      const width = Math.max(5, Math.min(50, image.width * scale)),
        height = (width * image.height) / image.width;
      const alpha =
        (e.alpha / 31) *
        Math.max(0, Math.min(1, curve(e.alphaCurve, p))) *
        Math.min(1, (1 - p) * 5);
      particles.push({
        id: `${index}:${n}`,
        frame,
        x,
        y,
        width,
        height,
        alpha: reducedMotion ? 0.55 : alpha,
        rotation: reducedMotion
          ? 0
          : e.rotate
            ? angle * 57.3 + ((p * e.rotation) / 65536) * 360
            : 0,
      });
    }
  }
  return particles.slice(0, maxParticles);
}
