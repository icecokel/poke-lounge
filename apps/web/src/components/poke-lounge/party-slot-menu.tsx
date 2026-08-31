import type { PokeLoungeCopy } from "./poke-lounge-copy";
import type { PokeLoungePartySlotSummary } from "./runtime/game/ui/mobile-world-ui";
import styles from "./party-slot-menu.module.css";

export function PokeLoungePartySlotMenu({
  copy,
  party,
}: {
  copy: PokeLoungeCopy;
  party: PokeLoungePartySlotSummary[];
}) {
  return (
    <section
      className={styles.partySlots}
      aria-labelledby="poke-lounge-party-slots-title"
      data-poke-lounge-party-slots="true"
    >
      <h3 id="poke-lounge-party-slots-title">{copy.partySlotsTitle}</h3>
      <ol className={styles.partySlotList}>
        {party.map(function mapItem(pokemon) {
          return (
            <li
              key={pokemon.slotIndex}
              className={styles.partySlot}
              data-active={pokemon.isActive || undefined}
              data-empty={pokemon.isEmpty || undefined}
              data-poke-lounge-party-slot={pokemon.slotIndex}
            >
              <span>{copy.partySlotLabel(pokemon.slotIndex + 1)}</span>
              <strong>{pokemon.isEmpty ? copy.partySlotEmpty : pokemon.name}</strong>
              {!pokemon.isEmpty ? (
                <small>
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
