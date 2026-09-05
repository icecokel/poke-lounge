# Poke Lounge Technical Release Gate

현재 문서는 제품의 기술적 릴리스 조건만 기록한다. 에셋 출처·권리 검증 자동화는 현재 제거되어 있으며 필요 시 별도 작업으로 다시 도입한다.

## Competitive battle V2 technical gate

릴리스 후보는 다음 grown-party competitive battle 계약을 만족해야 한다.

- 각 플레이어는 준비 마감 전에 1–6마리의 완전한 파티 snapshot을 제출한다.
- 서버는 snapshot을 고정하고 현재 V2 ruleset version/hash로 match를 생성한다.
- public room 응답은 match 배정 전 IV, move loadout, 내부 파생 battle stat을 노출하지 않는다.
- authoritative competitive result는 battle HP, PP, status, progression을 world save에 덮어쓰지 않는다.
- 2인 match는 `tournament-unranked`이며 verified ranking history를 만들지 않는다.
- legacy V1 nonterminal room은 닫고 legacy completed row는 audit 용도로만 유지한다.

검증 명령:

```bash
pnpm check:poke-lounge-competitive-catalog
pnpm check:poke-lounge-battle-resolution
pnpm test:poke-lounge-battle
pnpm test:api
pnpm test:web
```

PostgreSQL-backed API와 browser integration 검증은 migrated `_test` database와 `TEST_DATABASE_URL`이 추가로 필요하다.
