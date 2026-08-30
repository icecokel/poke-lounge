# Game Score Policy

Poke Lounge의 일반 `POST /game/result` 제출은 서버 권위 결과가 아니므로 저장을 거절한다.
`GET /game/ranking?gameType=POKE_LOUNGE`도 현재 빈 배열을 반환한다. room 안의 누적 점수와 최종
순위는 Redis room projection이 기준이며 일반 점수 제출 API로 보정하지 않는다.

`SKY_DROP` enum과 score policy는 기존 VSCoke database를 안전하게 migration하기 위한 legacy schema
호환 범위다. 독립 Web은 해당 게임을 노출하거나 제출하지 않는다.

정책의 source of truth는 `apps/api/src/game/game-score-policy.ts`, 경쟁 결과의 source of truth는
`apps/api/src/poke-lounge/`와 `packages/poke-lounge-battle/`이다.
