export function formatTypeEffectivenessMessage(effectiveness: number): string | null {
  if (effectiveness === 0) {
    return "효과가 없는 것 같다...";
  }

  if (effectiveness > 1) {
    return "효과는 굉장했다!";
  }

  if (effectiveness > 0 && effectiveness < 1) {
    return "효과가 별로인 듯하다...";
  }

  return null;
}
