import { MobileTaskScreen } from "@/components/poke-lounge/mobile/mobile-task-screen";
import { PixelPanel, PixelButton } from "@/components/poke-lounge/ui/poke-lounge-ui-primitives";
import type { LeagueBadgeNpc } from "@poke-lounge/battle/league/contract";
import { localizeGymName } from "./gym-name";
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
    <MobileTaskScreen
      title={`${copy.gym} ${localizeGymName(gym.displayName, locale)}`}
      name="gym-challenge"
      className="[&>[data-poke-lounge-task-body]]:grid [&>[data-poke-lounge-task-body]]:items-center"
      backLabel={copy.back}
      onBack={onBack}
      footer={
        <PixelButton className="min-h-14 w-full" onClick={onChallenge}>
          {copy.challenge}
        </PixelButton>
      }
    >
      <PixelPanel className="flex min-h-40 items-center justify-center p-4 text-center">
        <p>
          {copy.badges} {badges}/8 · {copy.gymPokemonCount(gym.composition.members.length)}
        </p>
      </PixelPanel>
    </MobileTaskScreen>
  );
}
