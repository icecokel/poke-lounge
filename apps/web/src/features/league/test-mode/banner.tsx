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
      className="sticky top-0 z-50 grid gap-1 rounded-lg border-2 border-yellow-600 bg-yellow-100 p-3 text-sm text-black dark:border-yellow-500 dark:bg-gray-900 dark:text-yellow-100"
    >
      <p className="font-bold">{test ? text.warning : text.serverMismatch}</p>
      {test && (
        <p className="break-words">
          {text.starter} {test.starterLevel === null ? text.unchanged : `Lv${test.starterLevel}`} ·{" "}
          {text.badges} {test.badgesRequired}
          {text.badgeUnit} · {text.opponents}{" "}
          {test.opponentLevelDrop === 0 ? "0" : `−${test.opponentLevelDrop}`} · {test.marker}
          {TEST_BUILD && <> · {text.gymRoamShort}</>}
        </p>
      )}
    </div>
  );
}
