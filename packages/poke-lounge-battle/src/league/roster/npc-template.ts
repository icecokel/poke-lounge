import {
  COMPETITIVE_MOVE_CATALOG,
  COMPETITIVE_SPECIES_CATALOG,
} from "../../competitive-catalog.generated";
import { GEN4_ROM_ITEMS, GEN4_ROM_SPECIES } from "../../gen4/rom-catalog.generated";
import type { LeagueComposition, LeagueStatValues } from "../contract";
import type { RomTrainer } from "./rom-trainers";
import type { SupplementMember } from "./supplements";

export class LeagueRosterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeagueRosterError";
  }
}

export interface NpcTemplateOptions {
  levelOf?: (slot: number, romLevel: number) => number;
}

function statValues(value: number): LeagueStatValues {
  return {
    hp: value,
    attack: value,
    defense: value,
    specialAttack: value,
    specialDefense: value,
    speed: value,
  };
}

export function npcComposition(
  trainer: RomTrainer,
  extra: readonly SupplementMember[] = [],
  options: NpcTemplateOptions = {},
): LeagueComposition {
  if (
    trainer.partyCount !== trainer.members.length ||
    trainer.members.length === 0 ||
    trainer.members.length + extra.length > 6 ||
    (trainer.gender !== "male" && trainer.gender !== "female")
  ) {
    throw new LeagueRosterError(`Invalid trainer: ${trainer.trainerId}`);
  }

  return {
    version: 1,
    leadSlot: 0,
    members: [...trainer.members, ...extra].map((member, slotIndex) => {
      const species = GEN4_ROM_SPECIES[member.speciesId];
      const override = "genderAbilityOverride" in member ? member.genderAbilityOverride : 0;
      const abilitySlot = override >> 4 === 2 ? 1 : 0;
      const abilityId = species?.abilities[abilitySlot] ?? species?.abilities[0];
      const genderOverride = override & 0xf;
      // pret trainer_data.c: 50:50은 트레이너 성별, 그 밖은 종족의 다수 성별.
      const pidGender = trainer.gender === "female" ? 0x78 : 0x88;
      const difficulty = "difficulty" in member ? member.difficulty : trainer.members[0].difficulty;
      const level = options.levelOf?.(slotIndex, member.level) ?? member.level;
      const moveIds = member.moveIds.filter(moveId => moveId !== 0);
      if (
        !species ||
        !COMPETITIVE_SPECIES_CATALOG[member.speciesId] ||
        !abilityId ||
        !Number.isInteger(difficulty) ||
        difficulty < 0 ||
        difficulty > 255 ||
        !Number.isInteger(level) ||
        level < 1 ||
        level > 100 ||
        (member.heldItemId !== 0 && !GEN4_ROM_ITEMS[member.heldItemId]) ||
        moveIds.length < 1 ||
        moveIds.length > 4 ||
        new Set(moveIds).size !== moveIds.length ||
        moveIds.some(moveId => !COMPETITIVE_MOVE_CATALOG[moveId])
      ) {
        throw new LeagueRosterError(`Invalid member: ${trainer.trainerId}/${slotIndex}`);
      }

      return {
        slotIndex,
        speciesId: member.speciesId,
        level,
        natureId: 0,
        abilityId,
        gender:
          species.genderRatio === 255
            ? "genderless"
            : species.genderRatio === 254
              ? "female"
              : species.genderRatio === 0
                ? "male"
                : genderOverride === 1
                  ? "male"
                  : genderOverride === 2
                    ? "female"
                    : species.genderRatio > pidGender
                      ? "female"
                      : "male",
        happiness: 70,
        individualValues: statValues(Math.floor((difficulty * 31) / 255)),
        effortValues: statValues(0),
        heldItemId: member.heldItemId,
        moves: moveIds.map(moveId => ({ moveId, maxPp: COMPETITIVE_MOVE_CATALOG[moveId].maxPp })),
      };
    }),
  };
}
