import type { LeagueLocale, LeagueTestModeView } from "../contract";
import { getTestModeCopy } from "./copy";
import { TEST_BUILD } from "./engine";

export function LeagueTestModeBanner({
  locale,
  test,
}: {
  locale: LeagueLocale;
  test?: LeagueTestModeView;
}) {
  if (!test && !TEST_BUILD) return null;
  const text = getTestModeCopy(locale);
  return (
    <div
      role="status"
      className="sticky top-0 z-50 grid gap-1 rounded-lg border-2 border-amber-700 bg-amber-100 p-3 text-sm text-amber-950 dark:border-amber-400 dark:bg-amber-950 dark:text-amber-100"
    >
      <p className="font-bold">{test ? text.warning : text.serverMismatch}</p>
      {test && (
        <p className="break-words">
          {text.starter} {test.starterLevel === null ? text.unchanged : `Lv${test.starterLevel}`} ·{" "}
          {text.badges} {test.badgesRequired}
          {text.badgeUnit} · {text.opponents}{" "}
          {test.opponentLevelDrop === 0 ? "0" : `−${test.opponentLevelDrop}`} · {test.marker}
        </p>
      )}
    </div>
  );
}
