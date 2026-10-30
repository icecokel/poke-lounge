import type { StandingEntry } from "../api/league";
import type { LeagueLocale } from "../contract";
import { PokemonIcon, speciesName, moveName } from "../battle/lead-picker";
import { getLeagueCopy } from "../shell/copy";
import { getRecordsCopy } from "./copy";
import { leagueRoleLabel } from "./role";

export function PartyCard({
  entry,
  locale,
  namesReady,
  isMe = false,
}: {
  entry: StandingEntry;
  locale: LeagueLocale;
  namesReady: boolean;
  isMe?: boolean;
}) {
  const text = getLeagueCopy(locale);
  return (
    <article className="grid min-w-0 gap-3 rounded-lg border p-4">
      <h3 className="flex flex-wrap items-center gap-2 font-bold [overflow-wrap:anywhere]">
        <span>
          {entry.position}. {entry.displayName}
        </span>
        {isMe && <span className="rounded border px-2 text-sm">{getRecordsCopy(locale).me}</span>}
      </h3>
      <p>
        {leagueRoleLabel(entry.position, entry.kind, locale)} · {entry.score} {text.score}
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {entry.publicParty.map((member, index) => (
          <li key={index} className="flex min-w-0 items-start gap-2">
            <PokemonIcon speciesId={member.speciesId} />
            <div className="min-w-0 [overflow-wrap:anywhere]">
              <p>
                {namesReady ? speciesName(member.speciesId, locale) : `#${member.speciesId}`} Lv
                {member.level}
              </p>
              {namesReady && (
                <p className="text-sm">
                  {member.moveIds.map(id => moveName(id, locale)).join(" · ") || "—"}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </article>
  );
}
