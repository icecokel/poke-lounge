import type { PokeLoungeCopy } from "./poke-lounge-copy";
import type { PokeLoungePartySlotSummary } from "./runtime/game/ui/mobile-world-ui";
import { localizePokemonName } from "./runtime/game/i18n/runtime-game-localization";
import { cn } from "@/lib/utils";

export function PokeLoungePartySlotMenu({
  copy,
  party,
}: {
  copy: PokeLoungeCopy;
  party: PokeLoungePartySlotSummary[];
}) {
  return (
    <section
      className="grid gap-2.5 rounded-xl border-2 border-[#17231c] bg-[rgb(248_251_240_/_74%)] p-3"
      aria-labelledby="poke-lounge-party-slots-title"
      data-poke-lounge-party-slots="true"
    >
      <h3
        id="poke-lounge-party-slots-title"
        className="m-0 text-[0.88rem] font-black text-[#35513a]"
      >
        {copy.partySlotsTitle}
      </h3>
      <ol className="m-0 grid list-none grid-cols-2 gap-2 p-0">
        {party.map(function mapItem(pokemon) {
          return (
            <li
              key={pokemon.slotIndex}
              className={cn(
                "grid min-h-[66px] content-center gap-0.5 rounded-lg border-2 border-[#607d6c] bg-[#f8fbf0] px-[9px] py-2",
                pokemon.isActive && "border-[#355c7d] bg-[#fff4a3]",
                pokemon.isEmpty && "text-[#607d6c]",
              )}
              data-active={pokemon.isActive || undefined}
              data-empty={pokemon.isEmpty || undefined}
              data-poke-lounge-party-slot={pokemon.slotIndex}
            >
              <span className="text-[0.62rem] font-extrabold text-[#4a5b4d]">
                {copy.partySlotLabel(pokemon.slotIndex + 1)}
              </span>
              <strong className="overflow-hidden text-[0.78rem] font-bold text-ellipsis whitespace-nowrap text-[#263238]">
                {pokemon.isEmpty
                  ? copy.partySlotEmpty
                  : localizePokemonName(pokemon.name, copy.locale)}
              </strong>
              {!pokemon.isEmpty ? (
                <small className="text-[0.62rem] font-extrabold text-[#4a5b4d]">
                  {pokemon.isActive ? `${copy.partySlotLead} · ` : ""}Lv.{pokemon.level}
                </small>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
