import type {
  MobileBattleCommandOption,
  MobileBattlePartyOption,
} from "../../contracts/battle-controls";

const commandOrder = ["fight", "bag", "run", "pokemon"] as const;
const partySize = 6;

/** Visual/tab order differs from the runtime's legacy 2×2 command indexes. */
export function getBattlePadCommands(commands: readonly MobileBattleCommandOption[]) {
  return commands
    .map((command, index) => ({ ...command, index }))
    .sort((left, right) => commandOrder.indexOf(left.id) - commandOrder.indexOf(right.id));
}

export function moveBattlePadCommandSelection(
  commands: readonly MobileBattleCommandOption["id"][],
  currentIndex: number,
  direction: "left" | "right" | "up" | "down",
): number {
  const command = commands[currentIndex];
  if (direction === "up") return commands.indexOf("fight");
  if (direction === "down") return command === "fight" ? commands.indexOf("run") : currentIndex;
  if (command === "fight") return currentIndex;
  const column = commandOrder.indexOf(command);
  const nextColumn = Math.max(1, Math.min(3, column + (direction === "left" ? -1 : 1)));
  return commands.indexOf(commandOrder[nextColumn]);
}

/** Keep empty slots in their real positions, including sparse/filtered snapshots. */
export function getBattlePadParty(party: readonly MobileBattlePartyOption[]) {
  return Array.from({ length: partySize }, (_, slotIndex) => {
    const pokemon = party.find(slot => slot.slotIndex === slotIndex && !slot.isEmpty) ?? null;
    const status = !pokemon
      ? ("empty" as const)
      : pokemon.isFainted || pokemon.currentHp <= 0
        ? ("fainted" as const)
        : ("ready" as const);
    return { slotIndex, pokemon, status };
  });
}
