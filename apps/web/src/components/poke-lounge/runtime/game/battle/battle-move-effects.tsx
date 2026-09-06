"use client";
import { useEffect, useState } from "react";
import {
  MOVE_ANIMATION_CATALOG,
  getEffectParticles,
  getEffectPhase,
  getMoveAnimationProfile,
} from "./move-animation-model";
import type { BattlePresentationState } from "./battle-ui-store";
import type { BattleStageLayout } from "./battle-stage-layout";
import styles from "./battle-move-effects.module.css";

export function BattleMoveEffects({
  presentation,
  layout,
}: {
  presentation: BattlePresentationState;
  layout: BattleStageLayout;
}) {
  const [reduced, setReduced] = useState(false);
  const [assetsMissing, setAssetsMissing] = useState(false);
  useEffect(() => {
    let disposed = false;
    const pages = [...new Set(MOVE_ANIMATION_CATALOG.frames.map(frame => frame.page))];
    const images = pages.map(page => {
      const image = new Image();
      image.onerror = () => {
        if (!disposed) setAssetsMissing(true);
      };
      image.src = `/assets/poke-lounge/battle-effects/particles-${page}.png`;
      return image;
    });
    return () => {
      disposed = true;
      for (const image of images) image.onerror = null;
    };
  }, []);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const effect = presentation.effect;
  if (!effect || presentation.entrance.active || presentation.evolution || presentation.capture)
    return null;
  const source = presentation[effect.cue.source].sprite,
    target = presentation[effect.cue.target].sprite;
  // Effects anchor to the neutral battler center, not to its in-flight/disappearing sprite.
  const origin = { x: source.effectOriginX ?? source.x, y: source.effectOriginY ?? source.y };
  const destination = { x: target.effectOriginX ?? target.x, y: target.effectOriginY ?? target.y };
  const particles = getEffectParticles(effect, origin, destination, reduced),
    profile = getMoveAnimationProfile(effect.cue);
  const transform = layout.actorTransform;
  const stageTransform = transform
    ? `translate(${transform.offsetX} ${transform.offsetY}) scale(${transform.scale})`
    : undefined;
  return (
    <svg
      className={styles.effects}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      data-battle-effect={effect.cue.kind}
      data-move-id={effect.cue.moveId}
      data-status-effect={effect.cue.kind === "status" ? effect.cue.status : undefined}
      data-effect-phase={getEffectPhase(effect)}
      data-effect-key={effect.key}
      data-effect-hit={effect.cue.hit}
      data-effect-assets-missing={assetsMissing || undefined}
      data-rom-native-adaptation={profile.emit.length === 0 || undefined}
    >
      <g transform={stageTransform}>
        {!assetsMissing &&
          particles.map(p => {
            const frame = MOVE_ANIMATION_CATALOG.frames[p.frame]!;
            return (
              <g
                key={p.id}
                opacity={p.alpha}
                transform={`translate(${p.x} ${p.y}) rotate(${p.rotation})`}
              >
                <svg
                  x={-p.width / 2}
                  y={-p.height / 2}
                  width={p.width}
                  height={p.height}
                  viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
                >
                  <image
                    href={`/assets/poke-lounge/battle-effects/particles-${frame.page}.png`}
                    width={MOVE_ANIMATION_CATALOG.atlasSize}
                    height={MOVE_ANIMATION_CATALOG.atlasSize}
                  />
                </svg>
              </g>
            );
          })}
        {profile.emit.length === 0 || assetsMissing ? (
          <g
            opacity={Math.sin(effect.progress * Math.PI) * 0.65}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            {[0, 1, 2].map(i => (
              <ellipse
                key={i}
                cx={origin.x}
                cy={origin.y}
                rx={12 + i * 7 + effect.progress * 18}
                ry={6 + i * 4 + effect.progress * 9}
              />
            ))}
          </g>
        ) : null}
        {["ground", "water"].includes(profile.windup) && effect.progress < 0.6 ? (
          <ellipse
            className={styles.ground}
            cx={origin.x}
            cy={origin.y + 17}
            rx={22}
            ry={6}
            opacity={Math.sin((effect.progress / 0.6) * Math.PI) * 0.65}
            data-windup-surface={profile.windup}
          />
        ) : null}
      </g>
    </svg>
  );
}
