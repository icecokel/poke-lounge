import { GameType } from './enums/game-type.enum';
import { isPublicRankingEligible } from './game-score-policy';

describe('isPublicRankingEligible', function testSuite() {
  it('excludes client-asserted Poke Lounge submissions from public rankings', function testCase() {
    expect(
      isPublicRankingEligible(GameType.POKE_LOUNGE, 'client-asserted'),
    ).toBe(false);
  });

  it('allows verified-room Poke Lounge submissions in public rankings', function testCase() {
    expect(isPublicRankingEligible(GameType.POKE_LOUNGE, 'verified-room')).toBe(
      true,
    );
  });

  it('keeps Sky Drop public-ranking eligible for generic submissions', function testCase() {
    expect(isPublicRankingEligible(GameType.SKY_DROP, 'client-asserted')).toBe(
      true,
    );
  });
});
