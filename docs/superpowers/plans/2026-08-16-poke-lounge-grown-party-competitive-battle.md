# Poke Lounge 육성 파티 경쟁전 전환 상세 작업 계획 — 현재 구현 반영본

> 최초 작성 시점에는 위에서 아래로 실행하는 작업 명세였고, 현재는 `main`의 구현과 남은
> release gate를 함께 기록하는 구현 기준 문서다. 구현 기준 commit은
> `597dd51 fix(poke-lounge):육성 파티 경쟁전 V2 보완`이다. 경쟁전의 고정 포켓몬·고정 레벨·
> 고정 파티 크기 규칙을 제거하고, 각 플레이어가 준비 시간 동안 실제로 모으고 키운 파티로
> 전투한다. 고정 loadout, 고정 레벨, mock 파티 fallback은 허용하지 않는다.

**목표:** 준비 시간이 끝나는 순간까지 서버에 commit된 각 플레이어의 최신 파티를 동결하고,
그 파티의 실제 종·레벨·슬롯·IV·기술·HP·상태·PP로 서버 권위 경쟁전의 초기 상태를 만든다.

**구현 원칙:** 기존 room revision/idempotency, PostgreSQL transaction, Socket.IO snapshot,
competitive action receipt, terminal convergence를 그대로 사용한다. 새 실시간 프로토콜, 새 DB
테이블, 새 런타임 의존성은 만들지 않는다.

**기술 스택:** Next.js 15, React 19, Phaser 3.90, NestJS 11, TypeORM, PostgreSQL,
Socket.IO, `@vscoke/poke-lounge-battle`, Jest, Node test runner, Playwright, pnpm 9.12.0.

**현재 상태:** V2 파티 계약, 서버 정규화, 동적 assignment, 실제 numeric species/move 표시,
V1 room migration과 unranked 정책은 구현됐다. 별도 2인 실제 Desktop/Mobile 육성 파티
Playwright spec은 만들지 않았고, 현재 자동화는 Web의 `poke-lounge-multiplayer.spec.ts`, API
E2E·repository integration, 실제 5-context `poke-lounge-five-player-tournament.spec.ts`로 나뉜다.
서로 다른 성장 파티를 사용한 2인 실제 브라우저 terminal·전용 screenshot gate는 남은 검증이다.

**문서 해석:** 아래 Task 0~8의 commit 블록은 최초 계획의 단계별 경계다. 실제 반영은 PR #45의
squash commit 하나로 이루어졌으므로 현재 작업에서 같은 commit 순서를 다시 만들 필요는 없다.

---

## 1. 구현 전에 고정할 제품 규칙

아래 내용은 구현 중 선택지가 아니다.

### 1.1 실제 파티의 의미

- 종, 레벨, 파티 슬롯, 선두 슬롯, IV, 기술 ID, 현재 HP, 상태, 남은 PP를 준비 종료 시점 값으로
  사용한다.
- 레벨을 올리거나 내리지 않는다. 상대와 레벨을 맞추지 않는다.
- 파티를 같은 종으로 바꾸지 않는다.
- 파티 크기는 1~6마리다. 2마리 고정 규칙은 제거한다.
- 빈 슬롯은 제거하지 않고 원래 0~5 슬롯 번호를 보존한다.
- EV는 현재 게임이 저장하지 않으므로 기존 런타임과 동일하게 전부 0으로 계산한다. EV 입력
  필드는 이번 계약에 추가하지 않는다.
- 이름, 최대 HP, 공격·방어·특수공격·특수방어·스피드, 타입, 기술 위력·명중·최대 PP는
  클라이언트 값을 받지 않는다. 서버 카탈로그로 계산한다.

### 1.2 HP, 상태, PP

- 준비 종료 직전의 `currentHp`, `status`, move `pp`를 그대로 사용한다.
- 경기 시작 시 자동 회복·상태 해제·PP 보충을 하지 않는다.
- `currentHp === 0`이면 상태는 반드시 `fainted`다.
- `currentHp > 0`이면 상태는 `normal | poisoned | burned | paralyzed` 중 하나다.
- 선두 슬롯은 반드시 전투 가능해야 한다. 파티에 살아 있는 포켓몬이 있어도 선두가
  전투불능이면 snapshot을 거절한다.
- 한 토너먼트의 다음 match는 준비 종료 때 동결한 같은 파티에서 다시 시작한다. 이전 PvP
  match의 피해·PP·상태는 다음 match나 월드 저장 상태에 누적하지 않는다.

### 1.3 경쟁전 기술 지원 범위

이번 작업은 파티 연결 버그를 해결하며 카탈로그 1~470의 모든 기술 효과를 새로 완성하는 작업은
아니다. 대신 기술을 다른 기술로 바꾸는 기존의 조용한 fallback은 제거한다.

- 모든 기술은 실제 numeric move ID, 이름, 타입, 분류, 위력, 명중, PP를 유지한다.
- 물리·특수 공격은 기존 Gen 4 대미지, STAB, 타입 상성, 명중, 급소, 85~100% 난수를 사용한다.
- 기존 런타임이 명시적으로 처리하는 효과 코드만 경쟁전에서도 처리한다.
  - 상태 부여: `4` 화상 10%, `6` 마비 10%, `66` 독, `67` 마비
  - 능력 단계 하락: `18` 공격, `19` 방어, `20` 스피드, `23` 명중, `60` 스피드 2단계
  - 우선도: `103` 전광석화 계열
- 그 밖의 부가 효과가 붙은 공격 기술은 실제 기본 대미지를 적용하고 부가 효과는 적용하지
  않는다. Web에는 “부가 효과 미지원” 표시를 제공한다.
- 지원하지 않는 순수 상태 기술은 실제 move ID/PP를 파티와 화면에 유지하되 선택 불가로
  표시한다. 위력 40 노말 공격으로 바꾸지 않는다.
- 현재 포켓몬에게 PP가 남은 선택 가능 기술이 하나도 없을 때만 `struggle`을 허용한다.
  지원하지 않는 순수 상태 기술만 남은 경우도 이 조건에 포함한다.
- 기술 획득 경로의 적법성은 이번 작업에서 검증하지 않는다. move ID가 카탈로그에 있고 값의
  상한이 맞는지만 검증한다. 포획·성장 command ledger가 생기기 전에는 클라이언트의 실제
  획득 이력을 서버가 증명할 수 없기 때문이다.

### 1.4 동결 시점

- `waiting`과 `round-started`에서만 파티 갱신을 허용한다.
- repository는 mutation을 적용하기 전에 room clock을 전진시키므로, 서버 `nowMs`가
  `round.endsAtMs`보다 작은 요청만 마지막 snapshot 후보가 된다.
- `nowMs === round.endsAtMs`인 요청은 먼저 tournament 전환을 commit하고 revision conflict를
  반환한다. 해당 파티 갱신은 반영하지 않는다.
- 별도 `frozenPartyByPlayerId` 복사본은 만들지 않는다. `partySnapshots`를 준비 중에는 mutable,
  tournament 진입 뒤에는 immutable로 만들어 같은 데이터를 다음 bracket match에서도
  재사용한다.
- 마감 시 연결된 participant 중 한 명이라도 V2 파티가 없으면 방 전체를 `closed`로 바꾸고
  `closeReason = "competitive-party-not-ready"`를 기록한다. casual/V1/fixed party로 내리지
  않는다.

### 1.5 랭킹 신뢰도

- 현재 파티와 save state는 클라이언트 기원이다. 실제 플레이로 획득한 레벨·종이라는 것을
  API가 증명하지 못한다.
- 따라서 새 동적 파티 assignment는 참가자가 정확히 2명이어도 항상
  `tournament-unranked`다.
- `VerifiedPokeLoungeHistoryWriter`를 호출하지 않는다.
- room final standings와 토너먼트 내부 점수는 기존처럼 표시한다.
- 공개 랭킹 재활성화는 서버 권위 포획·경험치·진화·기술·아이템 ledger 후속 작업으로 남긴다.

### 1.6 V1 호환

- 새 ruleset은 `rulesetVersion: 2`만 생성·전진·projection한다.
- 배포 migration에서 `waiting | round-started | tournament` 상태의 기존 room을
  `legacy-room-restart-required`로 종료한다. 짧은 수명의 진행 방을 런타임에서 이중 지원하지
  않는다.
- V1 pending/active match는 migration에서 제거한다. 해당 room은 이미 종료되므로 재개하지
  않는다.
- V1 completed match row는 감사용으로 보존한다.
- terminal transition 조회는 현재 ruleset version/hash만 projection해 완료된 V1 row가 V2
  Web parser에 들어가지 않게 한다.

---

## 2. 전환 전 버그와 현재 수정 경계

전환 전 흐름은 다음과 같았다. 아래 V1 흐름은 현재 구현 설명이 아니라 회귀 금지 대상으로
보존한 기록이다.

```txt
Web GameStateStore
  Desktop 꼬부기 Lv.11 / Mobile 리아코 Lv.13
  -> serverRoom.ts가 대표 포켓몬 1마리만 전송
  -> API room snapshot에 기술·IV·슬롯이 없음
  -> createCompetitiveAssignment(player IDs only)
  -> APPROVED_COMPETITIVE_RULESET_V1.loadout
  -> 양쪽 모두 브케인 Lv.50 + 치코리타 Lv.50
  -> authoritative adapter가 가상 species/move를 실제 포켓몬처럼 표시
```

수정 경계는 다음 네 곳이다.

1. Web은 `GameStateStore.party` 전체를 기존 `party-snapshot` mutation으로 전송한다.
2. API는 전체 파티를 공통 카탈로그로 검증·정규화하고 room JSONB에 비공개로 저장한다.
3. 공통 battle package는 고정 loadout 대신 두 개의 정규화 파티로 V2 initial state를 만든다.
4. Web은 V2 projection의 numeric species/move ID를 기존 runtime data와 sprite asset으로
   표시한다.

표시만 고치거나 API만 고치는 부분 수정은 허용하지 않는다.

---

## 3. 목표 계약

### 3.1 Web → API 입력

공통 package의 `competitive-party.ts`에 아래 입력 타입과 상수를 둔다. Web과 API는 이 타입을
공유하되 API DTO validation은 별도로 유지한다.

```ts
export const COMPETITIVE_PARTY_SNAPSHOT_VERSION = 2;
export const COMPETITIVE_PARTY_SLOT_COUNT = 6;
export const COMPETITIVE_MOVE_COUNT_MAX = 4;
export const COMPETITIVE_POKEMON_LEVEL_MIN = 1;
export const COMPETITIVE_POKEMON_LEVEL_MAX = 100;

export interface CompetitiveIndividualValues {
  hp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
}

export type CompetitivePersistentStatus =
  "normal" | "poisoned" | "burned" | "paralyzed" | "fainted";

export interface CompetitivePartyMemberInput {
  slotIndex: number;
  speciesId: number;
  level: number;
  currentHp: number;
  status: CompetitivePersistentStatus;
  individualValues: CompetitiveIndividualValues;
  moves: Array<{
    moveId: number;
    pp: number;
  }>;
}

export interface CompetitivePartyInput {
  version: 2;
  activeSlotIndex: number;
  members: CompetitivePartyMemberInput[];
}
```

공개 HTTP body는 기존 identity 필드를 유지하되 클라이언트가 서버 시간을 주입할 수 없게
`nowMs`를 받지 않는다.

```ts
export interface UpdatePokeLoungePartySnapshotInput {
  playerId: string;
  sessionId: string;
  displayName?: string;
  competitiveParty: CompetitivePartyInput;
}
```

`PokeLoungeRoomService` 내부 입력 타입에는 결정론적 unit test를 위한 `nowMs?`가 남아 있지만,
controller는 `withoutClientNowMs()`로 이를 제거한다. 클라이언트는 `name`, `maxHp`, 파생 능력치,
타입, move name/maxPp도 보내지 않는다.

### 3.2 API 내부 room snapshot

`PokeLoungePartySnapshot`은 비공개 내부 타입으로 바꾼다.

```ts
export interface PokeLoungePartySnapshot {
  version: 2;
  playerId: string;
  displayName?: string;
  competitiveParty: NormalizedCompetitiveParty;
  updatedAtMs: number;
}
```

`NormalizedCompetitiveParty`는 입력에 다음 서버 파생 필드를 더한 값이다.

```ts
export interface NormalizedCompetitivePartyMember {
  slotIndex: number;
  speciesId: number;
  level: number;
  currentHp: number;
  maxHp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
  typeIds: readonly [number] | readonly [number, number];
  status: CompetitivePersistentStatus;
  individualValues: CompetitiveIndividualValues;
  moves: readonly {
    moveId: number;
    pp: number;
  }[];
}

export interface NormalizedCompetitiveParty {
  version: 2;
  activeSlotIndex: number;
  members: readonly NormalizedCompetitivePartyMember[];
}
```

members는 `slotIndex` 오름차순으로 정규화한다. `activeSlotIndex`는 배열 index가 아니라 원래
0~5 slot 번호다.

### 3.3 공개 room snapshot

전체 기술·IV·파생 능력치는 match 시작 전 공개하지 않는다.

```ts
export interface PokeLoungePublicPartySnapshot {
  playerId: string;
  displayName?: string;
  representativePokemon: {
    speciesId: number;
    level: number;
    currentHp: number;
    maxHp: number;
  };
  partySize: number;
  updatedAtMs: number;
}
```

- `toPokeLoungePublicRoomState()`가 내부 `partySnapshots`를 위 요약으로 map한다.
- `representativePokemon`은 `activeSlotIndex`와 같은 member에서 서버가 만든다.
- 이름은 API에서 보내지 않는다. Web이 기존 runtime game data로 표시한다.
- public property 이름 `partySnapshots`는 유지해 계약 변경 범위를 줄이되 value type만 공개
  요약으로 바꾼다.

### 3.4 Canonical battle V2

```ts
export type CanonicalMoveId = number | "struggle";

export interface CanonicalBattleStatStages {
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
  accuracy: number;
  evasion: number;
}

export interface CanonicalMoveState {
  moveId: number;
  pp: number;
}

export interface CanonicalCombatantState {
  slotIndex: number;
  speciesId: number;
  level: number;
  maxHp: number;
  currentHp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
  typeIds: readonly [number] | readonly [number, number];
  statStages: CanonicalBattleStatStages;
  status: CompetitivePersistentStatus;
  moves: readonly CanonicalMoveState[];
}

export interface CanonicalPlayerState {
  playerId: string;
  activeSlotIndex: number;
  team: readonly CanonicalCombatantState[];
}

export interface CanonicalBattleState {
  rulesetVersion: 2;
  turn: number;
  participantIds: readonly [string, string];
  playersById: CanonicalIdRecord<CanonicalPlayerState>;
  terminal: CanonicalTerminalResult | null;
}
```

`createInitialBattleState()` 시그니처는 다음으로 고정한다.

```ts
export interface CompetitiveBattleParticipantInput {
  playerId: string;
  party: NormalizedCompetitiveParty;
}

export function createInitialBattleState(
  participants: readonly [CompetitiveBattleParticipantInput, CompetitiveBattleParticipantInput],
): CanonicalBattleState;
```

- participant ID를 정렬할 때 파티와 player ID 묶음을 함께 정렬한다.
- team은 `slotIndex` 순서를 유지한다.
- `statStages`는 매 match 시작마다 모두 0이다.
- IV는 room frozen party에만 보관하고 canonical match에는 파생 능력치만 넣는다.

### 3.5 Public competitive projection V2

match 시작 뒤에는 두 참가자가 전투에 필요한 현재 상태를 본다.

```ts
team: Array<{
  slotIndex: number;
  speciesId: number;
  level: number;
  maxHp: number;
  currentHp: number;
  status: CompetitivePersistentStatus;
  statStages: CanonicalBattleStatStages;
  moves: Array<{ moveId: number; pp: number }>;
}>;
```

projection에는 IV, 내부 공격·방어 수치, server seed를 포함하지 않는다. Web은 표시용 능력치와
move metadata를 runtime data에서 다시 만들지만 승패 계산에는 사용하지 않는다.

### 3.6 Action 계약

```ts
export type CanonicalCompetitiveAction =
  { kind: "move"; moveId: number | "struggle" } | { kind: "switch"; slotIndex: number };
```

- numeric move ID는 safe integer 1~470이어야 한다.
- switch slot은 0~5이며 현재 team member의 `slotIndex`로 찾는다.
- 빈 슬롯, 현재 슬롯, 전투불능 슬롯 교체는 거절한다.

---

## 4. 서버 검증과 오류 계약

### 4.1 구조 검증

`UpdatePokeLoungePartySnapshotDto`는 `class-validator`로 다음을 검사한다.

| 필드              | 규칙                          |
| ----------------- | ----------------------------- |
| `version`         | `@Equals(2)`                  |
| `activeSlotIndex` | 정수 0~5                      |
| `members`         | 배열 1~6개, nested validation |
| `slotIndex`       | 정수 0~5                      |
| `speciesId`       | 정수 1~493                    |
| `level`           | 정수 1~100                    |
| `currentHp`       | 0 이상의 정수                 |
| `status`          | 다섯 상태 enum                |
| IV 6개            | 각각 정수 0~31, 누락 불가     |
| `moves`           | 배열 1~4개                    |
| `moveId`          | 정수 1~470                    |
| `pp`              | 0 이상의 정수                 |

Global `ValidationPipe`의 `whitelist`와 `forbidNonWhitelisted`를 유지한다.

### 4.2 의미·파생값 검증

공통 package의 `normalizeCompetitiveParty()`가 다음 typed reason을 사용한다.

```ts
export type CompetitivePartyValidationReason =
  | "party-empty"
  | "party-too-large"
  | "slot-out-of-range"
  | "duplicate-slot"
  | "active-slot-missing"
  | "active-pokemon-fainted"
  | "species-unsupported"
  | "level-out-of-range"
  | "iv-out-of-range"
  | "hp-out-of-range"
  | "status-hp-mismatch"
  | "move-count-out-of-range"
  | "duplicate-move"
  | "move-unsupported"
  | "pp-out-of-range"
  | "no-battle-ready-pokemon";
```

- shared package는 Nest exception을 import하지 않는다.
- `CompetitivePartyValidationError`에 `reason`만 저장하고 원본 payload를 메시지에 넣지 않는다.
- API service가 이를 HTTP 400으로 변환한다.

```json
{
  "statusCode": 400,
  "code": "POKE_LOUNGE_COMPETITIVE_PARTY_INVALID",
  "message": "Competitive party snapshot is invalid",
  "reason": "pp-out-of-range"
}
```

### 4.3 lifecycle 충돌

`tournament | completed | closed`에서 party mutation을 시도하면 HTTP 409를 반환한다.

```json
{
  "statusCode": 409,
  "code": "POKE_LOUNGE_PARTY_SNAPSHOT_LOCKED",
  "message": "Poke Lounge party snapshot is locked"
}
```

revision/idempotency conflict body는 기존 계약을 유지한다. 마감 시각에 clock advance가 먼저
commit된 경우에는 기존 `POKE_LOUNGE_REVISION_CONFLICT`와 최신 public snapshot을 반환한다.

### 4.4 준비 실패 종료

마감 시 party가 없는 경우 HTTP mutation 오류를 만들지 않는다. room clock advance 자체를
정상 commit한다.

```ts
room.status = "closed";
room.closeReason = "competitive-party-not-ready";
room.round.phase = "completed";
room.round.endsAtMs = null;
room.tournament.activeMatchId = null;
room.tournament.activeMatchAuthority = null;
```

Web은 파티 mutation 자체가 실패했을 때 `server-room-error-copy.ts`의 ko/en/ja
`ROOM_PARTY_SYNC_FAILED` 문구를 표시한다. `competitive-party-not-ready` close reason은 public
room snapshot과 OpenAPI에는 있으나 현재 Web에 전용 안내 문구로 매핑하지 않았다. 별도 안내가
필요하면 후속 UI 작업으로 추가하며, 고정 파티로 계속 진행하는 버튼은 만들지 않는다.

---

## 5. 카탈로그와 규칙 hash

### 5.1 생성 입력과 출력

source는 `apps/web/public/game-data/pokemon-data.json` 한 곳이다.

- species는 1–493만 포함한다. 494–500 내부 레코드는 제외한다.
- move는 1–470만 포함한다. move 0은 제외한다.
- species 필드: `speciesId`, base stats 6개, primary/secondary type ID
- move 필드: `moveId`, `typeId`, `category`, `power`, `accuracy`, `effectCode`, `maxPp`
- 이름, 스프라이트, catch rate, growth rate, learnset은 server battle catalog에 넣지 않는다.

Node 표준 라이브러리만 사용하는
`scripts/poke-lounge/generate-competitive-catalog.mjs`를 추가한다.

출력은 두 파일로 나눈다.

1. `competitive-catalog.generated.ts`: API/default Node export용 lookup과 catalog hash
2. `competitive-catalog-metadata.generated.ts`: browser export용 hash, species/move count만 포함

Web browser bundle은 큰 server lookup을 import하지 않는다.

### 5.2 생성 명령

루트 `package.json`에 다음을 추가한다.

```json
{
  "generate:poke-lounge-competitive-catalog": "node scripts/poke-lounge/generate-competitive-catalog.mjs --write",
  "check:poke-lounge-competitive-catalog": "node scripts/poke-lounge/generate-competitive-catalog.mjs --check"
}
```

`--check`는 임시 메모리 결과와 commit된 generated file을 byte 비교하고 파일을 수정하지 않는다.

### 5.3 ruleset V2

`APPROVED_COMPETITIVE_RULESET_V1`을 active source에서 제거하고 loadout이 없는
`COMPETITIVE_RULESET_V2`를 만든다.

```ts
export const COMPETITIVE_RULESET_V2 = deepFreeze({
  version: 2,
  participantCount: 2,
  partySize: { minimum: 1, maximum: 6 },
  moveCountMaximum: 4,
  scores: { win: 100, loss: 50 },
  paralysisNoActionChance: 0.25,
  poisonDamageDivisor: 8,
  burnDamageDivisor: 8,
  burnPhysicalAttackDivisor: 2,
  damageRangePercent: { minimum: 85, maximum: 100 },
  criticalHitChance: 1 / 16,
  struggle: {
    moveId: "struggle",
    power: 50,
    accuracy: 100,
    recoilMaxHpDivisor: 4,
  },
  supportedPrimaryStatusEffectCodes: [18, 19, 20, 23, 60, 66, 67],
  supportedSecondaryEffectCodes: [4, 6],
  priorityEffectCodes: [103],
});
```

`COMPETITIVE_RULESET_HASH`는 canonical JSON의 다음 묶음으로 생성한다.

```txt
ruleset V2 config + COMPETITIVE_CATALOG_HASH
```

generated file을 바꾸고 ruleset hash를 갱신하지 않은 상태는 unit test에서 실패해야 한다.

---

## 6. 전투 전진 규칙 V2

`resolve-turn.ts`는 다음 순서를 정확히 유지한다.

1. canonical state와 두 action의 schema/invariant를 검증한다.
2. 두 switch action을 participant ID 정렬 순서로 적용한다.
3. move action은 우선도, 마비가 반영된 스피드, 동률 PRNG 순서로 정렬한다.
4. 행동 포켓몬이 전투불능이면 행동을 건너뛴다.
5. move PP를 1 차감한다.
6. 마비 행동 불가를 판정한다.
7. 명중을 판정한다. accuracy 0은 필중이다.
8. 물리/특수 분류에 맞는 공격·방어 능력치와 stage를 적용한다.
9. 화상 물리 공격 1/2, STAB, 타입 상성, 급소 2배, 85~100 난수를 적용한다.
10. 지원하는 상태·단계 효과와 struggle 반동을 적용한다.
11. 양쪽 move가 끝난 뒤 participant ID 정렬 순서로 독/화상 잔여 피해를 적용한다.
12. 각 피해 적용 직후 team 전멸을 검사한다. 먼저 전멸한 쪽이 패자다.
13. team이 남았지만 active가 쓰러진 경우 terminal을 만들지 않는다. 다음 turn에 player가 직접
    switch를 제출해야 한다.
14. turn을 1 증가하고 canonical hash를 만든다.

PRNG 소비 순서는 ruleset에 문자열 배열로 고정하고 spec에서 검증한다.

```txt
speed-tie
paralysis
accuracy
critical-hit
damage-range
secondary-effect
```

필요하지 않은 분기에서는 해당 난수를 소비하지 않는 현재 원칙을 유지한다. Web은 state를
로컬 계산하지 않고 projection만 표시하므로 서버 resolve 결과가 유일한 승패 기준이다.

---

## 7. 파일별 변경 목록

### 7.1 공통 battle package와 generator

- Modify: `package.json`
- Create: `scripts/poke-lounge/generate-competitive-catalog.mjs`
- Modify: `packages/poke-lounge-battle/src/actions.ts`
- Modify: `packages/poke-lounge-battle/src/canonical-state.ts`
- Create: `packages/poke-lounge-battle/src/competitive-party.ts`
- Create: `packages/poke-lounge-battle/src/competitive-catalog.generated.ts`
- Create: `packages/poke-lounge-battle/src/competitive-catalog-metadata.generated.ts`
- Create: `packages/poke-lounge-battle/src/gen4-battle-math.ts`
- Create: `packages/poke-lounge-battle/src/gen4-pokemon-stats.ts`
- Create: `packages/poke-lounge-battle/src/gen4-type-chart.ts`
- Create: `packages/poke-lounge-battle/src/battle-stat-stages.ts`
- Create: `packages/poke-lounge-battle/src/competitive-ruleset-config.ts`
- Modify: `packages/poke-lounge-battle/src/ruleset-contract.ts`
- Modify: `packages/poke-lounge-battle/src/ruleset.ts`
- Modify: `packages/poke-lounge-battle/src/resolve-turn.ts`
- Modify: `packages/poke-lounge-battle/src/index.ts`
- Modify: `packages/poke-lounge-battle/src/browser.ts`
- Create/Modify: 가까운 `*.spec.ts`

### 7.2 API

- Modify: `apps/api/src/poke-lounge/poke-lounge-room.types.ts`
- Modify: `apps/api/src/poke-lounge/poke-lounge-room.service.ts`
- Modify: `apps/api/src/poke-lounge/poke-lounge-room-policy.ts`
- Modify: `apps/api/src/poke-lounge/poke-lounge-room-conflict.ts`
- Modify: `apps/api/src/poke-lounge/postgres-poke-lounge-room.repository.ts`
- Modify: `apps/api/src/poke-lounge/dto/update-poke-lounge-party-snapshot.dto.ts`
- Modify: `apps/api/src/poke-lounge/dto/poke-lounge-room-response.dto.ts`
- Modify: `apps/api/src/poke-lounge/dto/submit-competitive-action.dto.ts`
- Modify: `apps/api/src/poke-lounge/dto/competitive-action-response.dto.ts`
- Modify: `apps/api/src/poke-lounge/competitive/competitive-action.types.ts`
- Modify: `apps/api/src/poke-lounge/competitive/competitive-match.types.ts`
- Modify: `apps/api/src/poke-lounge/competitive/competitive-match.repository.ts`
- Modify: `apps/api/src/poke-lounge/competitive/competitive-match.service.ts`
- Modify: `apps/api/src/poke-lounge/competitive/competitive-projection.service.ts`
- Modify: `apps/api/src/poke-lounge/competitive/postgres-competitive-match.repository.ts`
- Modify: `apps/api/src/poke-lounge/competitive/postgres-competitive-action.repository.ts`
- Create: `apps/api/src/migrations/1794960000000-close-legacy-poke-lounge-competitive-rooms.ts`
- Create: `apps/api/src/migrations/1794960000000-close-legacy-poke-lounge-competitive-rooms.spec.ts`
- Modify: `apps/api/scripts/start-poke-lounge-e2e-api.ts`
- Create: `apps/api/test/support/competitive-party.fixture.ts`
- Modify: 관련 service/repository/integration/E2E `*.spec.ts`
- Generate: `apps/api/openapi.json`
- Generate: `apps/web/src/types/api.d.ts`

### 7.3 Web

- Create: `apps/web/src/components/poke-lounge/runtime/game/network/competitive-party-snapshot.ts`
- Create: `apps/web/src/components/poke-lounge/runtime/game/network/competitive-party-snapshot.spec.ts`
- Modify: `apps/web/src/components/poke-lounge/runtime/game/network/localPreviewRoom.ts`
- Modify: `apps/web/src/components/poke-lounge/runtime/game/network/serverRoom.ts`
- Modify: `apps/web/src/components/poke-lounge/runtime/game/network/competitive-projection.ts`
- Modify: `apps/web/src/components/poke-lounge/runtime/game/data/game-data-json.ts`
- Modify: `apps/web/src/components/poke-lounge/runtime/game/scenes/WorldScene.ts`
- Modify: `apps/web/src/components/poke-lounge/runtime/game/scenes/BattleScene.ts`
- Modify: `apps/web/src/components/poke-lounge/runtime/game/battle/authoritative-battle-adapter.ts`
- Create: `apps/web/src/components/poke-lounge/runtime/game/battle/battle-world-persistence.ts`
- Create: `apps/web/src/components/poke-lounge/runtime/game/battle/battle-world-persistence.spec.ts`
- Modify: Web의 기존 Gen 4 math/stat/type/stage 파일을 shared export 재사용으로 전환
- Modify: `apps/web/src/components/poke-lounge/runtime/game/server-room-error-copy.ts`
- Modify: `apps/web/src/components/poke-lounge/runtime/game/gamePageStartup.ts`
- Modify: 모바일 shell과 battle UI의 V2 표시 경계
- Modify: 관련 Web unit tests
- Modify: `apps/web/tests/e2e/poke-lounge-multiplayer.spec.ts`
- Modify: `apps/web/tests/e2e/poke-lounge-five-player-tournament.spec.ts`
- Modify: `apps/web/scripts/playwright-integration-runner.mjs`

### 7.4 문서

- Modify: `docs/poke-lounge-game-concept.md`
- Modify: `docs/vscoke-monorepo-concept.md`
- Modify: `docs/game-score-policy.md`
- Modify: `docs/poke-lounge-release-gate.md`
- Modify: `docs/playwright-cli-test-spec.md`
- Modify: `docs/e2e-full-feature-test-scenarios.md`

---

## 8. 실행 순서

각 단계는 RED → GREEN → 해당 단계 검증 → commit 순서로 끝낸다. 다음 단계로 실패를 넘기지
않는다.

### Task 0. 작업 격리와 현재 버그 RED 고정

#### 작업

1. 저장소 root에서 현재 worktree 상태를 확인한다.
2. 아래 이름으로 worktree와 branch를 만든다.

```bash
git worktree add -b codex/fix/poke-lounge-grown-party \
  worktrees/fix/poke-lounge-grown-party main
```

3. 새 worktree에서 install 상태와 baseline을 확인한다.
4. 아래 RED test를 먼저 작성한다.

#### RED test

- `packages/poke-lounge-battle/src/ruleset.spec.ts`
  - `서로 다른 정규화 파티를 initial state에 그대로 보존한다`
- `apps/api/src/poke-lounge/competitive/competitive-match.service.spec.ts`
  - `꼬부기 Lv11과 리아코 Lv13으로 assignment를 만든다`
- `apps/web/src/components/poke-lounge/runtime/game/scenes/competitive-battle-launch.test.ts`
  - `numeric species projection을 실제 이름과 레벨로 표시한다`
- `apps/web/src/components/poke-lounge/runtime/game/network/server-room-snapshot-replay.test.ts`
  - `initial workflow가 대표 포켓몬이 아닌 전체 파티를 전송한다`

fixture는 다음으로 고정한다.

```txt
Desktop: slot 0 꼬부기 species 7, Lv11, 물대포 55
Mobile:  slot 2 리아코 species 158, Lv13, 물대포 55 + 물기 44
```

현재 실패가 Web 표시가 아니라 `createInitialBattleState(player IDs)`의 고정 loadout에서
시작하는지 failure message로 확인한다.

#### 검증

```bash
pnpm test:poke-lounge-battle -- ruleset.spec.ts
pnpm --filter @vscoke/api test -- competitive-match.service.spec.ts --runInBand
pnpm test:web
```

#### Gate

- 위 세 계층에서 고정 V1 loadout 때문에 RED가 난다.
- unrelated baseline failure가 있으면 구현 전에 별도 기록한다.

#### Commit

아직 commit하지 않는다. RED test는 Task 1~5의 첫 GREEN commit에 포함한다.

---

### Task 1. generated catalog와 공통 계산 함수 만들기

#### RED

별도 `competitive-catalog.spec.ts`는 만들지 않았다. catalog bounds/count/hash와 대표 종·기술
fixture는 `competitive-party.spec.ts`, ruleset과 catalog hash 결합은 `ruleset.spec.ts`에서
검증한다.

- species 1과 493이 있고 494는 없다.
- move 1과 470이 있고 0은 없다.
- 꼬부기 base stats/type과 물대포 definition이 source JSON과 같다.
- generated metadata count/hash가 server catalog와 같다.
- generator `--check`가 수정된 generated content를 감지한다.

기존 Web math spec을 공통 package로 옮겨 다음을 검증한다.

- Lv11 꼬부기 IV fixture의 max HP/공격/방어 계산
- 물대포의 물 STAB와 불 타입 상성
- 물리/특수 방어 선택
- stage -6~+6 clamp

#### GREEN

1. generator를 작성한다.
2. catalog 두 파일을 생성한다.
3. `gen4PokemonStats.ts`, `gen4BattleMath.ts`, `gen4-type-chart.ts`,
   `battle-stat-stages.ts`의 순수 계산을 shared package에 둔다.
4. Web 기존 파일은 shared named export를 import/re-export해 호출부를 한 번에 대규모 수정하지
   않는다.
5. server `index.ts`는 전체 catalog lookup을 export하고 `browser.ts`는 metadata와 순수 계산만
   export한다.

#### 검증

```bash
pnpm generate:poke-lounge-competitive-catalog
pnpm check:poke-lounge-competitive-catalog
pnpm --filter @vscoke/poke-lounge-battle lint
pnpm test:poke-lounge-battle
pnpm check:poke-lounge-battle-resolution
pnpm test:web
```

#### Gate

- generator를 두 번 실행해 두 번째 diff가 없다.
- browser export가 큰 server catalog object를 참조하지 않는다.
- Web 기존 야생전 math test 결과가 바뀌지 않는다.

#### Commit

```text
refactor(poke-lounge):전투 계산과 카탈로그 공유
```

---

### Task 2. 공통 battle engine을 동적 파티 V2로 전환

#### RED

`competitive-party.spec.ts`에 다음 case를 모두 추가한다.

- 서로 다른 1마리/6마리 파티와 서로 다른 레벨 보존
- 빈 slot을 건너뛴 slot 0/2/5 순서 보존
- active slot missing/fainted 거절
- duplicate slot/move 거절
- species 494, level 0/101, IV -1/32 거절
- derived max HP 초과 거절
- status/HP 불일치 거절
- max PP 초과 거절
- unsupported pure status move는 보존하되 selectable=false

`resolve-turn.spec.ts`에 다음을 추가한다.

- numeric move action
- physical/special damage
- 타입 무효/반감/약점/STAB
- 독·화상·마비와 residual
- stat stage 하락
- priority와 paralysis speed
- non-contiguous switch slot
- active faint 뒤 명시적 switch
- selectable move가 없을 때 struggle
- 다음 match initial state 생성 시 frozen party 값으로 reset
- 같은 input/seed의 state hash 결정성

#### GREEN

1. `competitive-party.ts`의 타입, error, normalize 함수를 구현한다.
2. `CanonicalBattleState`를 V2 전용으로 바꾼다.
3. `CanonicalCompetitiveAction.moveId`를 `number | "struggle"`로 바꾼다.
4. `COMPETITIVE_RULESET_V2`와 새 hash를 만든다.
5. `createInitialBattleState(participants with parties)`를 구현한다.
6. resolver의 fixed template 비교를 일반 invariant 검증으로 교체한다.
7. combatant lookup과 switch는 array index가 아니라 `slotIndex`를 사용한다.
8. V2 전진 순서와 지원 효과를 구현한다.
9. V1 loadout, `CompetitiveLoadoutEntry`, 가상 move/species ID active export를 제거한다.
10. 타입 이름을 `CompetitiveAssignmentV2`, `ResolvedTurnV2`로 갱신한다.

#### 검증

```bash
pnpm --filter @vscoke/poke-lounge-battle lint
pnpm test:poke-lounge-battle
pnpm check:poke-lounge-battle-resolution
```

#### Gate

- package source/test에 `vscoke-alpha`, `vscoke-beta`, `teamSize: 2`, fixed Lv50 loadout이 없다.
- dynamic 1~6 team의 move/switch/terminal이 결정론적으로 통과한다.

#### Commit

```text
feat(poke-lounge):동적 파티 전투 규칙 추가
```

---

### Task 3. API 전체 파티 DTO와 비공개 room 저장 구현

#### RED

- 새 `update-poke-lounge-party-snapshot.dto.spec.ts`를 만든다.
- `poke-lounge-room.service.spec.ts`에 valid/invalid/locked case를 추가한다.
- `poke-lounge-room-response.dto.spec.ts`에 public summary 필드와 full party 비노출 assertion을
  추가한다.
- `poke-lounge-room-conflict` test에서 revision conflict snapshot도 full IV/moves를 노출하지
  않는지 확인한다.

#### GREEN

1. nested DTO를 exact contract로 구현한다.
2. service에서 `normalizeCompetitiveParty()`를 호출한다.
3. 내부 `partySnapshots[playerId]`에 정규화된 full party를 저장한다.
4. `toPokeLoungePublicRoomState()`가 public summary로 투영하게 한다.
5. party update 시작 시 room status를 검사하고 locked 409를 던진다.
6. displayName은 participant 이름을 우선하고 payload는 기존 방식으로 trim한다.
7. request hash에는 full party가 canonical key order로 들어가 기존 idempotency replay가 그대로
   동작하게 한다.
8. public DTO/OpenAPI example을 numeric species와 party size로 갱신한다.

#### 검증

```bash
pnpm build:poke-lounge-battle
pnpm --filter @vscoke/api test -- \
  update-poke-lounge-party-snapshot.dto.spec.ts \
  poke-lounge-room.service.spec.ts \
  poke-lounge-room-response.dto.spec.ts \
  --runInBand
pnpm --filter @vscoke/api lint
```

#### Gate

- DB room state에는 full normalized party가 있다.
- REST/Socket/conflict snapshot에는 representative summary만 있다.
- invalid party는 저장·receipt·revision을 만들지 않는다.

#### Commit

```text
feat(poke-lounge):전체 파티 스냅샷 검증 추가
```

---

### Task 4. 준비 마감 동결과 모든 assignment 생성 경로 연결

#### RED

`poke-lounge-room-policy.spec.ts`:

- 마감 직전 마지막 V2 snapshot으로 tournament 전환
- snapshot 누락 시 `competitive-party-not-ready` closed
- `nowMs === endsAtMs` 파티 mutation보다 clock advance 우선

`postgres-poke-lounge-room.repository.spec.ts`:

- initial assignment에 꼬부기 Lv11/리아코 Lv13이 들어감
- assignment 생성과 room revision이 한 transaction에서 commit
- exact 2-player도 `tournament-unranked`

`postgres-competitive-match.repository.spec.ts`:

- 두 번째 seat bind로 assignment를 만들 때 room frozen party 사용

`postgres-competitive-action.repository.spec.ts`:

- 첫 match terminal 뒤 다음 bracket assignment도 같은 frozen party 사용
- 첫 match PvP HP/PP가 다음 initial state에 남지 않음
- dynamic 2-player 완료 뒤 history writer 미호출

#### GREEN

1. `advancePokeLoungeRoomClock()`에서 active participant의 V2 snapshot 존재 여부를 먼저
   검사한다.
2. 실패하면 closed snapshot을 만들고 bracket/assignment를 만들지 않는다.
3. 현재 `CompetitiveAssignmentCreateContext`는 identity 전용 `players`와 생성 순간에만 쓰는
   `parties: Record<playerId, NormalizedCompetitiveParty>`를 분리한다.

```ts
interface CompetitiveAssignmentCreateContext {
  players: [CompetitivePlayerAccount, CompetitivePlayerAccount];
  parties: Record<string, NormalizedCompetitiveParty>;
}
```

`createCompetitiveAssignment()`이 두 값을 player ID로 결합해 `initialState`를 만든다. DB entity와
public projection은 `parties`나 IV 원문을 별도 column/property로 노출하지 않고, identity는
`playerAccounts`, 전투 상태는 `initialState/currentState`에 저장한다.

4. `CompetitiveMatchKind`와 `createCompetitiveAssignment()`의 `kind` 입력은 완료된 legacy
   `ranked-head-to-head` row 호환을 위해 유지한다. 신규 V2 assignment를 만드는 모든 caller는
   `tournament-unranked`만 전달한다.
5. 아래 세 assignment 경로를 모두 수정한다.
   - `ensureActiveTournamentAssignment()`
   - `PostgresCompetitiveMatchRepository.bindSeatAndAssign()`
   - `createNextCompetitiveAssignment()` in competitive action repository
6. `planCompetitiveSeatBinding()`의 `assignmentKind`는 `tournament-unranked | null`만 계산한다.
   `ranked-head-to-head`를 새로 선택하는 분기는 없다.
7. 다음 match 생성은 room `partySnapshots`를 다시 읽고 새 initial state를 만든다.
8. completed terminal transition query는 V2 version/hash만 반환한다.
9. `shouldPublishVerifiedHistory()`는 legacy ranked row에만 true를 유지하되 새 assignment에서는
   해당 kind를 생성할 수 없게 한다.

#### 검증

```bash
pnpm build:poke-lounge-battle
pnpm --filter @vscoke/api test -- \
  poke-lounge-room-policy.spec.ts \
  postgres-poke-lounge-room.repository.spec.ts \
  competitive/postgres-competitive-match.repository.spec.ts \
  competitive/postgres-competitive-action.repository.spec.ts \
  --runInBand
pnpm --filter @vscoke/api lint
```

#### Gate

- 세 assignment 경로가 모두 frozen party 없이는 compile되지 않는다.
- 새 exact 2-player match에서 `VerifiedPokeLoungeHistoryWriter.write` 호출은 0회다.
- V1/fixed/casual fallback 경로가 없다.

#### Commit

```text
feat(poke-lounge):준비 종료 파티를 대전에 연결
```

---

### Task 5. V2 projection과 Web 실제 파티 표시 구현

#### RED

`competitive-projection.test.ts`:

- 서로 다른 team 길이와 non-contiguous slot 허용
- numeric species/move, level/status/stage parse
- 7번째 member, duplicate slot, invalid HP/PP reject
- V1 version/hash reject

`competitive-party-snapshot.spec.ts`:

- full party payload exact 변환
- name/maxHp 파생값 미전송
- missing IV/move/currentHp이면 명시적 local invalid 결과
- 빈 physical slot을 건너뛰되 원래 slot 번호 유지

`competitive-battle-launch.test.ts`:

- 꼬부기 Lv11과 리아코 Lv13 실제 이름/sprite/move 표시
- slot 2 active party 배치
- unsupported status move disable
- fixed 브케인/치코리타 미표시

`server-room-snapshot-replay.test.ts`:

- initial workflow는 party 성공 뒤에만 ready 전송
- 로컬 party 변경 시 같은 room의 최신 party를 다시 전송
- tournament 이후 mutation은 서버의 locked 409가 최종 방어선임을 확인

#### GREEN

1. `competitive-party-snapshot.ts`의 `createCompetitivePartySnapshot(playerSnapshot)`이 서버에
   보내는 최소 V2 payload를 만든다.
2. serverRoom initial workflow는 payload 변환 실패 시 ready로 진행하지 않고
   `ROOM_PARTY_SYNC_FAILED`를 발행한다.
3. `MultiplayerRoom.connect(snapshot)`이 이미 연결된 room에서 다시 호출되면
   party refresh를 시도할 수 있다. lifecycle 허용 여부는 API가 결정하며 tournament 이후에는
   `POKE_LOUNGE_PARTY_SNAPSHOT_LOCKED`로 거절한다.
4. WorldScene의 `createLocalSnapshotSyncKey()`는 위치를 제외하고 player ID/display/active
   slot/full party만 포함한다.
5. BattleScene은 `persistBattlePartyToWorld()`로 비권위 wild/casual 결과를 store에 반영한다.
   WorldScene store subscription이 변경을 감지해 `PLAYER_CHANGED_MAP`을 보내므로 BattleScene이
   room transport를 직접 호출하지 않는다.
6. `persistBattlePartyToWorld()`은 완료된 authoritative battle이면 즉시 반환한다. 서버 PvP
   피해·PP·상태를 `GameStateStore`에 덮어쓰지 않는다.
7. projection parser의 고정 array size/loadout 검증을 V2 generic invariant로 바꾼다.
8. `MAX_COMPETITIVE_ARRAY_ITEMS`를 participant action용 2와 team용 6으로 분리한다.
9. adapter의 `SPECIES_VIEW`, `MOVE_VIEW`를 제거한다.
10. `game-data-json.ts`에 numeric species/move display lookup을 추가한다.
11. `getBattlePokemonAssets(speciesId)`로 실제 front/back sprite를 사용한다.
12. move button은 actual name/type/category/power/accuracy/maxPp를 표시한다.
13. unsupported primary status move는 disabled, unsupported secondary effect는 별도 badge/copy를
    표시한다.
14. party select는 six physical slots를 유지하고 빈 slot을 그대로 표시한다.
15. 현재 Web은 authority를 “서버 권위전 · 공개 랭킹 미반영”, 규칙을 “전투 규칙 · 육성 파티 ·
    레벨 유지”로 나눠 표시한다. 모바일 battle dock도 같은 move 지원 상태와 disabled 판단을
    사용한다.
16. adapter가 `BattlePokemon` presentation model을 채울 때 runtime species base stat/type과
    actual level을 사용한다. IV가 없는 public projection에서 만든 표시용 능력치는 서버 전투
    계산에 재사용하지 않으며, authoritative action은 계속 move ID/switch slot만 전송한다.
17. shared `isCompetitiveMoveSelectable()`을 server action validation, Web disabled state,
    struggle 판정에서 함께 사용해 양쪽 판단이 갈리지 않게 한다.

#### 검증

```bash
pnpm test:web
pnpm lint:web
pnpm type:check:web
```

#### Gate

- Web source/test에 가상 species/move view가 없다.
- 성장 결과가 BattleScene 첫 frame의 이름·레벨·sprite·move와 일치한다.
- PvP 종료 뒤 local world party HP/PP/status가 경기 전 frozen 값에서 바뀌지 않는다.

#### Commit

```text
fix(poke-lounge):육성 파티를 경쟁 화면에 표시
```

---

### Task 6. legacy room data migration과 API 계약 생성

#### RED

Migration spec에 다음 row를 만든다.

- waiting V1 room
- round-started V1 room
- tournament V1 room + pending/active match/action receipt
- completed V1 room + completed match
- 이미 completed 일반 room

#### GREEN

Migration `up`:

1. migration 실행 시점의 기존 room은 모두 legacy shape로 간주하고 `partySnapshots`를 빈
   record로 정리한다. completed room의 standings와 tournament 결과는 유지한다.
2. nonterminal Poke Lounge room의 state를 closed/restart-required로 갱신한다.
3. round phase를 completed, endsAtMs를 null로 만든다.
4. activeMatchId/authority를 null로 만든다.
5. revision을 1 증가시키고 updated/expires timestamp를 갱신한다.
6. V1 pending/active competitive match를 제거한다. FK cascade 결과를 spec에서 확인한다.
7. completed match와 completed room history는 보존한다.

Migration `down`은 삭제한 ephemeral room state를 안전하게 복구할 수 없으므로 의도적인
no-op으로 두고 이유를 주석과 migration spec에 기록한다. 운영 rollback은 닫힌 방을 되살리지
않고 사용자가 새 방을 만들게 한다.

그 다음 DTO/controller에서 OpenAPI를 생성한다.

```bash
pnpm generate:types
pnpm check:api-contract
```

생성 명령을 다시 실행해 두 번째 diff가 없어야 한다.

#### 검증

```bash
pnpm --filter @vscoke/api test -- \
  1794960000000-close-legacy-poke-lounge-competitive-rooms.spec.ts \
  migration-identity.spec.ts \
  --runInBand
pnpm generate:types
pnpm generate:types
pnpm check:api-contract
pnpm --filter @vscoke/api lint
pnpm lint:web
pnpm type:check:web
```

두 번 생성한 `apps/api/openapi.json`과 `apps/web/src/types/api.d.ts`의 SHA-256을 비교해
byte-stable인지 확인한다. 구현 파일의 의도된 diff까지 없애라는 뜻이 아니다.

#### Gate

- 새 client/새 API가 같은 V2 OpenAPI 계약을 사용한다.
- V1 진행 방은 재개되지 않는다.
- completed V1 감사 row는 남지만 V2 projection으로 나오지 않는다.

#### Commit

```text
chore(poke-lounge):V1 경쟁 방 전환 정리
```

---

### Task 7. API integration과 실제 Desktop/Mobile E2E

#### 7.1 API integration

`apps/api/test/poke-lounge-room.repository.integration-spec.ts`에 다음을 추가한다.

- 두 계정이 서로 다른 V2 party snapshot commit
- 마감 transaction에서 V2 initial/current state 생성
- room JSONB에는 IV가 있고 public response에는 없음
- stale revision/idempotency replay에도 같은 frozen state 유지

`apps/api/test/poke-lounge-competitive.repository.integration-spec.ts`에 다음을 추가한다.

- 두 numeric move action commit과 state hash 전진
- switch receipt와 forced switch
- terminal→다음 assignment에서 frozen party reset
- exact 2-player terminal 뒤 verified history 0개

#### 7.2 전용 E2E runner 수정

현재 `playwright-integration-runner.mjs`가 전달받은 Poke Lounge spec 대신 취미 spec만 실행하는
경로를 바로잡는다.

- `process.argv.slice(2)`의 spec/Playwright args를 보존한다.
- Poke Lounge spec이면 `apps/api/scripts/start-poke-lounge-e2e-api.ts`를 사용한다.
- `NODE_ENV=test`, `POKE_LOUNGE_E2E=1`, `POKE_LOUNGE_E2E_RESET_DB=1`을 API child에만 준다.
- Playwright child에서는 DB URL/username/password를 제거하고
  `POKE_LOUNGE_E2E_ENV_ISOLATED=1`만 준다.
- `_test` suffix guard와 process group cleanup을 유지한다.

#### 7.3 현재 2인 자동화 범위

별도 `poke-lounge-grown-party-competitive.spec.ts`는 현재 만들지 않았다. 다음 세 계층이 역할을
나눠 검증한다.

1. `poke-lounge-multiplayer.spec.ts`
   - numeric species/move projection과 실제 이름·레벨 표시
   - full party snapshot 전송, initial party→ready 순서, revision recovery
   - authoritative move/switch/terminal UI와 월드 파티 비오염
   - 이 spec의 room/API transport는 browser route fixture를 사용한다.
2. API E2E와 repository integration
   - 서로 다른 V2 party, frozen initial state, numeric action, terminal, 다음 assignment reset
   - internal IV 보존과 public redaction
   - `tournament-unranked`와 verified history 0개
3. `poke-lounge-five-player-tournament.spec.ts`
   - 실제 PostgreSQL, REST, Socket.IO, 다섯 인증 identity
   - Desktop Chromium/Firefox/WebKit과 Mobile Chromium/WebKit의 action·terminal·recovery 수렴

`apps/api/scripts/start-poke-lounge-e2e-api.ts`의 test-only assertion은 internal party 요약,
initial/current match state, kind/ruleset/action count, verified history count를 제공한다. IV 원문과 DB
credential은 artifact에 쓰지 않는다.

서로 다른 성장 결과를 실제 두 browser에서 만들고 terminal까지 완주하는 전용 시나리오는 아직
남아 있다. 추가할 때는 아래 checkpoint를 최소 증거로 유지한다.

```txt
01-desktop-grown-party.png
02-mobile-grown-party.png
03-desktop-competitive-entry.png
04-mobile-competitive-entry.png
05-dynamic-switch.png
06-desktop-final.png
07-mobile-final.png
```

#### 7.4 현재 5인 bracket 회귀

기존 5-player spec은 실제 API/DB/Socket과 다섯 browser context, 첫 active match, touch action,
terminal→두 번째 round assignment, full reload, same-page reconnect, recovery cursor,
screenshot/run report를 검증한다. 두 번째 round 진입 뒤 남은 match를 실행하지 않으므로 현재 증거를
“모든 round 완료”나 “최종 우승자 확인”으로 판정하지 않는다.

5-player spec은 다음 순서로 최종 우승자까지 확장한다.

1. `currentRound`의 모든 active match를 차례로 실행하고 각 match의 양쪽 실제 UI action을 남긴다.
2. 각 match는 `reason=faint` terminal로 끝나야 한다. timeout·forfeit 결과는 실패로 처리한다.
3. terminal 뒤 다음 assignment가 열릴 때 frozen party의 species/level/move/physical slot이 같고 이전
   PvP HP/status/PP가 새 initial state에 누적되지 않았는지 browser와 DB 양쪽에서 확인한다.
4. round와 match별 Desktop/Mobile 시작·action·switch·terminal screenshot을 수집한다. 파일명에는
   `round-{roundNumber}-match-{matchNumber}`와 실행 환경을 포함한다.
5. 마지막 match 뒤 bracket `status=completed`, `currentRound=null`, `championPlayerId`가 확정되고
   다섯 browser, REST projection, DB standings의 1위가 같은 player인지 확인한다.
6. `completedRounds`의 모든 실제 match가 terminal이고 action count가 0보다 큰지 확인한다.

현재 starter 진입 흐름을 사용하므로 각 참가자를 서로 다른 species/level/party size로 성장시키는
assertion은 없다. 아래 항목은 2인 전용 live gate와 함께 남은 확장 범위다.

- bye player의 서로 다른 frozen party가 다음 match에도 같은지 확인
- spectator가 match 시작 전 full move/IV를 볼 수 없는지 live response로 확인

#### 검증

```bash
pnpm test:api:e2e

pnpm --filter @vscoke/web e2e -- \
  tests/e2e/poke-lounge-multiplayer.spec.ts \
  --project=chromium

TEST_DATABASE_URL="$TEST_DATABASE_URL" \
PLAYWRIGHT_WORKERS=1 \
PLAYWRIGHT_ENABLE_CROSS_BROWSER=1 \
pnpm --filter @vscoke/web e2e:integration -- \
  tests/e2e/poke-lounge-five-player-tournament.spec.ts
```

#### Gate

- 구현됨: API E2E/repository integration과 5-context spec은 실제 PostgreSQL, REST, Socket.IO,
  서로 다른 인증 identity를 사용한다.
- 구현됨: 5-context spec은 첫 match의 Desktop/Mobile terminal, reload/reconnect, 다음 round 진입과
  checkpoint screenshot을 수집한다.
- 남음: 5-context spec이 모든 round와 match를 `faint` terminal로 끝내고 다섯 browser·REST·DB의
  동일한 최종 우승자까지 확인해야 한다.
- 남음: 서로 다른 성장 파티를 만든 2인 Desktop/Mobile 전용 live spec과 위 7개 전용 screenshot.
- 남음: 이 live gate가 통과하기 전에는 “육성 파티 실제 브라우저 검증 완료”로 표시하지 않는다.

#### Commit

```text
test(poke-lounge):육성 파티 경쟁전 회귀 추가
```

---

### Task 8. 문서, 잔여 고정 규칙 검색, 전체 검증

#### 문서 수정

- `poke-lounge-game-concept.md`
  - 고정 Lv50 loadout 설명을 frozen grown party V2로 교체
  - HP/status/PP 보존과 match 간 reset 명시
  - 2인도 client-authored party 동안 unranked임을 명시
- `vscoke-monorepo-concept.md`
  - 전체 파티 snapshot → normalization → assignment 흐름 추가
  - ruleset V2와 catalog generation 추가
- `game-score-policy.md`
  - 새 dynamic party match가 verified history를 만들지 않는 신뢰 이유 추가
- `poke-lounge-release-gate.md`
  - 기술 변경은 asset rights 결정을 바꾸지 않음을 유지
  - Desktop/Mobile grown-party E2E를 기술 gate에 추가
- `playwright-cli-test-spec.md`, `e2e-full-feature-test-scenarios.md`
  - 전용 runner와 현재 자동화 매핑 추가

#### 잔여 검색

아래 검색 결과는 migration 이름, 과거 문서 인용, “없어야 한다”는 negative assertion 외 0건이어야
한다.

```bash
rg -n "APPROVED_COMPETITIVE_RULESET_V1|CompetitiveLoadoutEntry|vscoke-alpha|vscoke-beta|steady-strike|stun-spark|heavy-blow|fixed Lv\.50|고정 Lv\.50" \
  packages/poke-lounge-battle apps/api/src apps/web/src apps/web/tests docs \
  --glob '!docs/superpowers/plans/**'
```

레벨 동일화 가능성이 있는 숫자 50은 무작정 제거하지 않는다. 아래 검색으로 경쟁전 인접 코드만
검토한다.

```bash
rg -n "level.{0,20}50|50.{0,20}level|teamSize.{0,10}2|loadout" \
  packages/poke-lounge-battle apps/api/src/poke-lounge \
  apps/web/src/components/poke-lounge/runtime/game
```

#### 전체 검증

```bash
pnpm check:poke-lounge-competitive-catalog
pnpm --filter @vscoke/poke-lounge-battle lint
pnpm test:poke-lounge-battle
pnpm check:poke-lounge-battle-resolution

pnpm --filter @vscoke/api lint
pnpm test:api
pnpm test:api:e2e

pnpm generate:types
pnpm check:api-contract
pnpm lint:web
pnpm type:check:web
pnpm test:web
pnpm knip

pnpm build
```

`pnpm check:poke-lounge-provenance`는 기존 unresolved rights 때문에 의도적으로 실패하는 현재
상태를 유지한다. 이 known failure를 기능 실패로 오인하거나 manifest를 승인 상태로 바꾸지
않는다.

#### 현재 검증 상태 — 2026-08-17

- PR #45 API check와 Vercel build는 통과했다.
- PR #45 Web check는 기능 test가 아니라 mobile test collection assertion에서 실패했다. 현재
  `poke-lounge-mobile.spec.ts`는 13개 test를 수집하지만 `pull-request-check.yml`의 `main`은
  `Total: 1 test in 1 file`을 기대한다.
- 따라서 현재 `main`을 “전체 검증 통과”로 기록하지 않는다. collection 기대값 동기화와 2인
  실제 성장 파티 browser gate가 남아 있다.

#### 최종 commit

```text
docs(poke-lounge):육성 파티 경쟁 규칙 반영
```

---

## 9. 상세 테스트 매트릭스

| 계층            | 정상                                 | 실패/경계                                   |
| --------------- | ------------------------------------ | ------------------------------------------- |
| Catalog         | species 1–493, move 1–470            | excluded IDs, generated drift               |
| Party normalize | 1~6, holes, different levels         | duplicate, invalid IV/HP/PP/status          |
| Initial state   | different species/level/size         | duplicate player, missing party             |
| Resolver        | move, switch, status, type, struggle | illegal move/switch, fainted active         |
| Room service    | waiting/prep update                  | spectator, locked lifecycle, invalid party  |
| Room policy     | last pre-deadline commit freeze      | exact deadline, missing party close         |
| Assignment      | initial, seat bind, next bracket     | no party, stale V1, missing seat            |
| Projection      | numeric dynamic team                 | V1/hash mismatch, over-size, duplicate slot |
| Web sync        | initial, store change, battle return | local invalid, tournament locked            |
| Web adapter     | actual name/level/sprite/move        | missing runtime data/asset                  |
| Ranking         | room standings                       | verified history must remain zero           |
| Recovery        | REST, Socket, reload/reconnect       | revision conflict, old transition filter    |
| Browser         | Desktop keyboard, Mobile touch       | viewport overflow, disabled move copy       |

---

## 10. 완료 인수 조건

아래 표는 목표를 줄이지 않고 현재 증거 수준을 구분한다. `구현`은 코드와 unit/API integration
증거가 있다는 뜻이며, `남음`은 실제 browser release gate가 아직 없다는 뜻이다.

| ID  | 인수 조건                                                            | 현재 상태                              |
| --- | -------------------------------------------------------------------- | -------------------------------------- |
| 1   | 스타터와 성장 결과가 경쟁전 첫 포켓몬과 정확히 일치                  | 구현, 2인 live gate 남음               |
| 2   | 서로 다른 플레이어의 종과 레벨이 다르게 유지                         | 구현, 2인 live gate 남음               |
| 3   | 파티 1~6마리와 빈 slot의 physical 번호 유지                          | 확정 버그 수정, unit 검증              |
| 4   | active slot과 switch가 physical slot 번호로 동작                     | 구현                                   |
| 5   | 실제 기술 ID/PP를 사용하고 고정 기술로 대체하지 않음                 | 구현                                   |
| 6   | 고정 브케인/치코리타, Lv50, 2마리 loadout fallback 제거              | 구현                                   |
| 7   | 서버가 species/level/IV/derived HP/move/PP/status invariant 검증     | 구현                                   |
| 8   | 준비 종료 전에 commit된 최신 snapshot만 사용                         | 구현                                   |
| 9   | invalid/missing party를 명시적으로 실패시키고 fallback 금지          | 구현                                   |
| 10  | PvP 피해가 월드 save와 다음 bracket initial state에 누적되지 않음    | 구현                                   |
| 11  | REST/Socket/reload/reconnect가 frozen party와 match state로 수렴     | 5-context 구현, 성장 fixture 확장 남음 |
| 12  | match 전 public room에서 상대 IV와 전체 move를 노출하지 않음         | 구현                                   |
| 13  | Desktop과 Mobile이 서로 다른 실제 육성 파티로 terminal 화면까지 도달 | 수동 live 완료, 전용 자동화 남음       |
| 14  | 2인도 `tournament-unranked`, verified history 0개                    | 구현                                   |
| 15  | V1 진행 방 restart-required 종료, completed V1 감사 row 보존         | 구현                                   |
| 16  | OpenAPI와 Web generated type이 V2 계약과 일치                        | 구현                                   |
| 17  | generated catalog와 source JSON byte-stable check 통과               | 구현                                   |
| 18  | 전체 lint/typecheck/unit/API E2E/browser E2E/build 통과              | 부분 완료, Web CI 수정 남음            |
| 19  | 5인 bracket의 모든 round를 끝내고 모든 계층이 같은 최종 우승자 확인  | 남음                                   |

---

## 11. 비범위

- 서버 권위 야생전투·포획·경험치·진화·기술·아이템 ledger
- client-authored 성장 파티의 공개 verified 랭킹 재활성화
- 카탈로그 1~470 기술의 완전한 Gen 4 효과 구현
- PvP 피해를 월드 파티에 영구 반영하는 규칙
- matchmaking, 시즌, 친구 목록, 로비 재설계
- 여러 API 인스턴스 Socket fan-out
- 에셋 권리 상태 변경
- 토너먼트 순위 점수 변경
- Poke Lounge 이외 게임 수정

이 계획의 완료 상태는 “육성한 파티가 서버 권위 대전에 그대로 들어간다”까지다. “그 육성
과정이 서버에서 검증됐다”는 뜻은 아니며, 그 경계를 흐리지 않기 위해 공개 랭킹은 비활성으로
유지한다.
