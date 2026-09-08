import { Dex, Pokemon, Side, State, type Battle } from "@pkmn/sim";

// @pkmn/sim 0.10.11 encodes constructor.name, but decodes fixed names like
// [Pokemon:p1a]. Production minification renames constructors and breaks round trips.
// Keep the wire names explicit without disabling minification or changing global State.
const positions = "abcdefghijklmnopqrstuvwx";
const catalogTypes = [
  [Dex.Condition, "Condition"],
  [Dex.Ability, "Ability"],
  [Dex.Item, "Item"],
  [Dex.Move, "Move"],
  [Dex.Species, "Species"],
] as const;

export function serializeGen4Battle(battle: Battle): ReturnType<typeof State.serializeBattle> {
  const serializer: typeof State = Object.create(State);
  serializer.toRef = object => {
    const referenceId = "id" in object ? object.id : undefined;
    if (object === battle) return "[Battle]";
    if (object === battle.field) return "[Field]";
    if (object instanceof Pokemon) {
      const position = positions[object.position];
      if (!position) throw new Error("Invalid Pokémon reference position");
      return `[Pokemon:${object.side.id}${position}]`;
    }
    if (object instanceof Side) return `[Side:${object.id}]`;
    for (const [constructor, type] of catalogTypes) {
      if (object.constructor === constructor && typeof referenceId === "string")
        return `[${type}${referenceId ? ":" : ""}${referenceId}]`;
    }
    throw new Error("Unsupported simulator reference");
  };
  return serializer.serializeBattle(battle);
}
