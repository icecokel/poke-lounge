import type { LeagueBadgeNpc } from "@poke-lounge/battle/league/contract";
import { localizeTrainerName } from "@/components/poke-lounge/runtime/game/i18n/runtime-game-localization";
import type { LeagueLocale } from "../contract";
import type { GrowthCopy } from "./copy";
export function GymChallengePanel({
  gym,
  badges,
  copy,
  locale,
  onChallenge,
  onBack,
}: {
  gym: LeagueBadgeNpc;
  badges: number;
  copy: GrowthCopy;
  locale: LeagueLocale;
  onChallenge(): void;
  onBack(): void;
}) {
  return (
    <section className="space-y-4 rounded border border-gray-300 p-6">
      <h2>
        {copy.gym} {localizeTrainerName(gym.displayName, locale)}
      </h2>
      <p>
        {copy.badges} {badges}/8 · {copy.gymPokemonCount(gym.composition.members.length)}
      </p>
      <div className="flex gap-3">
        <button className="rounded border px-4 py-2" onClick={onChallenge}>
          {copy.challenge}
        </button>
        <button className="rounded border px-4 py-2" onClick={onBack}>
          {copy.back}
        </button>
      </div>
    </section>
  );
}
