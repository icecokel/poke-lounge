# 리그 운영 절차

리그 전용 운영 문서다. 기존 방·토너먼트·Redis·전투 워커 설정은 변경하지 않는다. SQL은 운영자가 검토 후 PostgreSQL `psql`에서 실행한다. 이 문서 작성 과정에서 운영 DB 작업이나 배포를 실행하지 않았다. F2의 profile·badge_battle·run_save 관련 SQL은 F2 마이그레이션 병합·적용 후 사용한다.

## SQL 실행 원칙

읽기 조회로 대상을 확인하고, 쓰기를 한 트랜잭션으로 실행한 뒤 결과를 다시 조회한다. 모든 조치에 담당자·사유·변경 전 값을 감사 표에 남긴다. 감사 표는 삭제하지 않는다. 오류가 나면 `ROLLBACK` 후 처음부터 검토한다. 잠금 순서는 season → run → badge_battle/run_save → attempt → record다. 같은 종류의 여러 행은 id 순서로 잠근다. 작업 중 다른 표나 운영 멀티플레이 스택을 조작하지 않는다.

각 예제 전에 실제 값을 설정한다. UUID는 대상 조회 결과를 그대로 사용한다. 예제 값으로 실행하지 않는다.

```sql
\set ON_ERROR_STOP on
\set operator '담당자'
\set reason '조치 사유와 내부 근거'
\set season 1
\set user '00000000-0000-0000-0000-000000000000'
```

## 1. 활성화·비활성화

GitHub 배포 설정 순서:

1. Secret `LEAGUE_JUDGE_TOKEN`을 설정한다. ASCII 32~256자이며 `BATTLE_WORKER_TOKEN`과 달라야 한다.
2. Variables `LEAGUE_SEASON1_STARTS_AT`, `LEAGUE_SEASON1_STARTERS`(중복 없는 종족 번호 3~6종), `LEAGUE_SEASON1_STARTER_LEVEL=10`을 설정한다. 시즌 1은 후보 풀로 대신 만들지 않는다.
3. `LEAGUE_STARTER_POOL`(중복 없는 종족 번호 3~60종), `LEAGUE_SETTLE_GRACE_HOURS=6`, `LEAGUE_EXP_MULTIPLIER=1.5`를 설정한다.
4. `COMPOSE_PROFILES=league`, `LEAGUE_ENABLED=true`를 설정하고 정상 main 배포 절차를 실행한다.
5. 기존 `/health`·`/health/ready`·멀티플레이 화면을 확인한다. `/league/v1/status`가 200인지, `enabled: true`와 시즌 시각이 있는지 확인한다. 리그 첫 화면 링크의 표시와 실제 진입은 브라우저로 확인한다. 배포의 리그 확인 실패는 경고만 남기므로 배포 성공만으로 활성화를 판단하지 않는다.

끄기: `LEAGUE_ENABLED`와 `COMPOSE_PROFILES`를 비우고 배포한다. 리그 값이 비면 기존 서비스 목록·배포 명령은 그대로다. 프로필 서비스가 `--remove-orphans`로 제거되는지는 미확인이다. 운영 스택의 담당자가 정확한 compose 디렉터리·프로젝트를 확인한 후 다음 명령으로 판정 컨테이너를 수동 중지한다.

```sh
COMPOSE_PROJECT_NAME=poke-lounge-prod docker compose --profile league stop league-judge
```

끄기 후 리그 경로의 404와 진입 링크 숨김, 기존 게임 정상 진행을 확인한다. 로컬 확인에서 `poke-lounge-prod`를 사용하지 않는다.

## 2. 시즌 일정

| 시점              | KST 일정                                                     |
| ----------------- | ------------------------------------------------------------ |
| 첫 시작           | 지정한 월요일 00:00                                          |
| 마감              | 시작 후 27일 18시간, 일요일 18:00                            |
| 진행 중 도전 대기 | 기본 최대 6시간, 월요일 00:00까지                            |
| 정산              | 마감 후 진행 중 도전이 없거나 대기 기한이 지난 뒤 첫 60초 틱 |
| 다음 시작         | 이전 마감 + 6시간과 정산 시각 중 늦은 시각                   |
| 다음 마감         | 예정 시작 + 27일 18시간(정산 지연에도 달력 유지)             |

첫 시작 예: `2026-11-02T00:00:00+09:00`. DB가 KST 월요일 00:00 정렬을 검사한다. 맞지 않으면 `league.season1_misaligned`, 시즌은 미생성이다. 환경값을 고쳐 재배포한다. `LEAGUE_SETTLE_GRACE_HOURS`는 대기 기한만 바꾸며 다음 시즌 예정 시작의 고정 6시간과는 별개다.

격리 로컬에서만 `LEAGUE_DEV_SEASON_MINUTES=N`(정수 10~10080)을 사용할 수 있다. 시즌 길이는 N분, 대기·다음 시작 간격은 `max(1, floor(N/10))`분이며 월요일 정렬 검사를 생략한다. `league.dev_season_override` 경고를 확인하고 실제 사용값을 플레이 검증 보고서에 기록한다. 운영 compose·배포에는 이 변수를 전달하지 않는다. 로컬 경험치 상향도 격리 환경에만 적용하며 게임 상태를 주입하지 않는다.

## 3. 다음 시즌 스타터 입력

마감 72시간 전까지 다음 시즌 계획을 넣는다. 종족 1~~493, 3~~6종, 중복 없음, 레벨 1~100(기본 10). 진화 전 단계 종족을 권장한다. 후보 풀은 배포 변수 `LEAGUE_STARTER_POOL`의 쉼표 목록이다. 풀 변경은 재배포가 필요하며 정산 직후 반영을 권장한다. 계획이 있으면 풀보다 우선한다. 무효 계획은 풀로 우회하지 않고 수정 때까지 정산을 기다린다.

먼저 조회한다. 아래 `next_season`은 현재 정산 안 된 시즌 + 1이다.

```sql
\set next_season 2
SELECT id, settled_at, closes_at FROM poke_lounge_league_season ORDER BY id;
SELECT * FROM poke_lounge_league_season_plan WHERE season_id = :next_season;
```

신규 입력(이미 계획이나 시즌이 있으면 오류로 중단):

```sql
BEGIN;
SELECT id FROM poke_lounge_league_season WHERE id = :next_season - 1 FOR UPDATE;
CREATE TEMP TABLE league_plan_target ON COMMIT DROP AS
  SELECT :next_season::integer AS id;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM poke_lounge_league_season s, league_plan_target t
                 WHERE s.id = t.id - 1 AND s.settled_at IS NULL)
     OR EXISTS (SELECT 1 FROM poke_lounge_league_season s, league_plan_target t WHERE s.id = t.id) THEN
    RAISE EXCEPTION '시즌이 이미 생성되었거나 이전 시즌이 없음';
  END IF;
END $$;
INSERT INTO poke_lounge_league_audit (operator, action, season_id, reason, before)
VALUES (:'operator', 'season_plan', :next_season, :'reason', NULL);
INSERT INTO poke_lounge_league_season_plan
  (season_id, starter_species_ids, starter_level, note, created_by)
VALUES (:next_season, ARRAY[1,4,7]::smallint[], 10, '운영자 지정', :'operator');
COMMIT;
SELECT * FROM poke_lounge_league_season_plan WHERE season_id = :next_season;
```

수정은 이전 시즌이 아직 정산되지 않았을 때만 한다. 아래의 후보·레벨을 실제 계획으로 바꾼다.

```sql
BEGIN;
SELECT id FROM poke_lounge_league_season WHERE id = :next_season - 1 FOR UPDATE;
INSERT INTO poke_lounge_league_audit (operator, action, season_id, reason, before)
SELECT :'operator', 'season_plan', p.season_id, :'reason', to_jsonb(p)
FROM poke_lounge_league_season_plan p
JOIN poke_lounge_league_season s ON s.id = p.season_id - 1
WHERE p.season_id = :next_season AND s.settled_at IS NULL;
UPDATE poke_lounge_league_season_plan p
SET starter_species_ids = ARRAY[152,155,158]::smallint[], starter_level = 10,
    note = '계획 수정', created_by = :'operator'
FROM poke_lounge_league_season s
WHERE p.season_id = :next_season AND s.id = p.season_id - 1 AND s.settled_at IS NULL;
COMMIT;
SELECT * FROM poke_lounge_league_season_plan WHERE season_id = :next_season;
```

수정 결과가 0행이면 이미 정산됐거나 계획이 없으므로 신규 입력 절차와 현재 시즌부터 다시 확인한다.

마감 72시간 이내 계획이 없으면 `league.season_plan_missing`이 시간당 한 번 나온다. 정산 시 계획이 없으면 풀에서 무작위 3종을 선택한다. 풀도 없거나 무효이면 10분마다 같은 경고를 남기며 `closing`에 머문다. 풀 형식 오류는 `league.starter_pool_invalid`, 계획 중복 등은 `league.season_plan_invalid`다.

```sql
SELECT id, starter_source, starter_seed, starter_species_ids, starter_level
FROM poke_lounge_league_season ORDER BY id DESC LIMIT 2;
```

자동 선택은 `starter_source='pool'`, 부호 있는 64비트 `starter_seed`를 남기며 `league.season_starters_from_pool` 로그에도 기록한다. 자동 조치는 감사 표에 쓰지 않는다. 당시 배포 풀·직전 시즌 묶음·시드를 아래 오프라인 계산에 넣으면 결과를 재현할 수 있다. 시드는 JS Number로 바꾸지 않고 문자열에서 BigInt로 읽는다. DB·API 호출이나 플레이 판정 용도가 아니다.

```js
const pool = [1, 4, 7, 152, 155, 158]; // 당시 LEAGUE_STARTER_POOL
const previous = [1, 4, 7];
let state = BigInt.asUintN(64, BigInt("0")); // starter_seed의 정확한 십진 문자열
let ids = pool.filter(id => !previous.includes(id));
if (ids.length < 3) ids = [...pool];
ids.sort((a, b) => a - b);
for (let i = ids.length - 1; i > 0; i--) {
  state = BigInt.asUintN(64, state + 0x9e3779b97f4a7c15n);
  let z = state;
  z = BigInt.asUintN(64, (z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n);
  z = BigInt.asUintN(64, (z ^ (z >> 27n)) * 0x94d049bb133111ebn);
  z ^= z >> 31n;
  const j = Number(z % BigInt(i + 1));
  [ids[i], ids[j]] = [ids[j], ids[i]];
}
console.log(ids.slice(0, 3).sort((a, b) => a - b));
```

## 4. 정산 확인

정상 로그 순서: `league.settle_waiting`(진행 중 도전이 있으면 10분 간격) → `league.season_settled` → `league.season_created` → 풀 사용 시 `league.season_starters_from_pool`. 마지막 세 이벤트는 성공한 인스턴스에서만 남는다. 동시 인스턴스는 시즌 행 잠금과 미정산 시즌 1개 고유 인덱스로 한 번만 정산한다.

```sql
SELECT id, starts_at AT TIME ZONE 'Asia/Seoul' AS starts_kst,
       closes_at AT TIME ZONE 'Asia/Seoul' AS closes_kst,
       settle_deadline AT TIME ZONE 'Asia/Seoul' AS deadline_kst, settled_at,
       starter_source, starter_seed, starter_species_ids
FROM poke_lounge_league_season ORDER BY id DESC LIMIT 2;
SELECT * FROM poke_lounge_league_hall_of_fame WHERE season_id = :season ORDER BY position;
SELECT final_rank, count(*) FROM poke_lounge_league_record
WHERE season_id = :season GROUP BY final_rank ORDER BY final_rank;
SELECT status, close_reason, count(*) FROM poke_lounge_league_run
WHERE season_id = :season GROUP BY status, close_reason;
```

정산 시즌의 명예의 전당은 NPC를 포함해 5행, 기록의 `final_rank`는 1부터 연속, 열린 run은 0개다. 정산은 남은 도전 만료·명예의 전당·최종 순위·run 닫기·다음 시즌 생성을 같은 트랜잭션으로 처리한다. SQL 조회는 운영 진단이며 플레이어 테스트 통과 근거가 아니다.

## 5. 엔진·규칙 변경 배포

리그 엔진 리비전·경험치 배율·관장 레벨 계획·리그 AI는 정산 직후부터 다음 시즌 첫 리그 입장 전 사이에 배포한다. 첫 시즌은 공용 AI를 사용한다. 마감 직후 정산하면 예정 시작까지 최대 6시간이 있다. 대기 기한까지 정산이 늦어졌다면 새 시즌이 바로 시작하더라도 성장 초기화 후 8배지를 모아 첫 입장을 하기 전까지가 변경 구간이다. 첫 입장 유무는 다음 조회로 확인한다.

```sql
SELECT season_id, count(*), min(entered_at) FROM poke_lounge_league_attempt
WHERE season_id = :next_season GROUP BY season_id;
```

이 구간 밖 긴급 배포는 T7에 의해 진행 중 도전이 접근 시 `void(engine_retired)`가 되고 배지 8개가 복구된다. 진행 중 배지전도 접근 시 `void`로 처리하며 새로 도전한다. 배포 후 `/league/v1/status`의 `engineVersion`을 확인한다(health 캐시 최대 60초). 멀티플레이 배포를 리그 때문에 막지 않는다.

## 6. 부정 의심 검토(읽기만)

운 통계와 같은 시드 대비 급소 횟수를 확인한다. 공개 시드로 미리 계산할 수 있는 위험은 있으며 첫 시즌 판단 기준은 사람이 정한다. 통계만으로 자동 제재하지 않는다.

```sql
SELECT r.user_id, r.attempt_id, r.score,
       sum((m.measure->'luck'->>'critsFor')::integer) AS crits_for,
       sum((m.measure->'luck'->>'critsAgainst')::integer) AS crits_against,
       sum((m.measure->'luck'->>'missesFor')::integer) AS misses_for,
       sum((m.measure->'luck'->>'missesAgainst')::integer) AS misses_against
FROM poke_lounge_league_record r JOIN poke_lounge_league_match m ON m.attempt_id = r.attempt_id
WHERE r.season_id = :season GROUP BY r.user_id, r.attempt_id, r.score
ORDER BY crits_for DESC;
SELECT a.match_seeds->m.match_index AS seed, m.match_index, a.id,
       m.measure->'luck' AS luck, m.inputs
FROM poke_lounge_league_attempt a JOIN poke_lounge_league_match m ON m.attempt_id = a.id
WHERE a.season_id = :season ORDER BY (a.match_seeds->m.match_index)::text, m.match_index, a.id;
SELECT a.id, a.entered_at, a.composition, r.checkpoint,
       mon.id AS mon_id, mon.species_id, mon.level, mon.minted_at
FROM poke_lounge_league_attempt a JOIN poke_lounge_league_run r ON r.id = a.run_id
JOIN poke_lounge_league_mon mon ON mon.run_id = r.id
WHERE a.season_id = :season AND a.user_id = :'user'::uuid ORDER BY mon.minted_at;
SELECT id, checkpoint, created_at, updated_at FROM poke_lounge_league_run
WHERE season_id = :season AND user_id = :'user'::uuid ORDER BY created_at;
SELECT b.id, b.badge_index, b.status, b.claim, b.measure, b.created_at, b.finished_at
FROM poke_lounge_league_badge_battle b JOIN poke_lounge_league_run r ON r.id = b.run_id
WHERE r.season_id = :season AND b.user_id = :'user'::uuid ORDER BY b.created_at;
```

`run.checkpoint`는 마지막 승인 값만 보관한다. 과거 체크포인트 전체 이력은 현재 스키마에 없으므로 복원할 수 없다. 배지전의 `claim`·시각과 발급 기록·입장 구성으로 남은 구간만 검토하며 이 한계를 기록한다. 서버 세이브도 마지막 사본 하나다.

## 7. 기록 무효화·정산 후 명예의 전당 수정

먼저 대상 최고 기록과 원 도전을 조회한다. 플레이어당 최고 기록 1건만 저장하므로 삭제한 사람의 이전 낮은 기록은 복원되지 않는다. 다른 사람의 과거 `best_rank`는 실제 도달값이므로 낮추지 않는다.

```sql
SELECT * FROM poke_lounge_league_record WHERE season_id = :season AND user_id = :'user'::uuid;
SELECT a.* FROM poke_lounge_league_attempt a JOIN poke_lounge_league_record r ON r.attempt_id = a.id
WHERE r.season_id = :season AND r.user_id = :'user'::uuid;
SELECT * FROM poke_lounge_league_hall_of_fame WHERE season_id = :season ORDER BY position;
```

같은 트랜잭션에서 원 도전을 무효화하고 순위를 다시 계산한다. 정산된 시즌이면 `final_rank`와 명예의 전당도 함께 고친다. 원본은 감사 표의 `before`에 남긴다.

```sql
BEGIN;
SELECT id FROM poke_lounge_league_season WHERE id = :season FOR UPDATE;
SELECT id FROM poke_lounge_league_run WHERE season_id = :season ORDER BY id FOR UPDATE;
SELECT id FROM poke_lounge_league_attempt WHERE season_id = :season ORDER BY id FOR UPDATE;
SELECT user_id FROM poke_lounge_league_record WHERE season_id = :season ORDER BY user_id FOR UPDATE;
CREATE TEMP TABLE league_removed ON COMMIT DROP AS
  SELECT * FROM poke_lounge_league_record WHERE season_id = :season AND user_id = :'user'::uuid;
INSERT INTO poke_lounge_league_audit (operator, action, season_id, user_id, attempt_id, reason, before)
SELECT :'operator', 'record_void', season_id, user_id, attempt_id, :'reason', to_jsonb(r)
FROM league_removed r;
INSERT INTO poke_lounge_league_audit (operator, action, season_id, user_id, attempt_id, reason, before)
SELECT :'operator', 'attempt_void', a.season_id, a.user_id, a.id, :'reason', to_jsonb(a)
FROM poke_lounge_league_attempt a JOIN league_removed r ON r.attempt_id = a.id;
DELETE FROM poke_lounge_league_record r USING league_removed d
WHERE r.season_id = d.season_id AND r.user_id = d.user_id;
UPDATE poke_lounge_league_attempt a SET status = 'void', fail_reason = 'moderated',
  finished_at = COALESCE(a.finished_at, now()), updated_at = now()
FROM league_removed r WHERE a.id = r.attempt_id;
UPDATE poke_lounge_league_season SET standings_rev = standings_rev + 1
WHERE id = :season AND EXISTS (SELECT 1 FROM league_removed);
CREATE TEMP TABLE league_ranked ON COMMIT DROP AS
  SELECT r.*, row_number() OVER (ORDER BY score DESC, accept_seq) AS position
  FROM poke_lounge_league_record r WHERE season_id = :season;
INSERT INTO poke_lounge_league_audit (operator, action, season_id, user_id, reason, before)
SELECT :'operator', 'record_void', r.season_id, r.user_id, :'reason', to_jsonb(r)
FROM poke_lounge_league_record r JOIN league_ranked k USING (season_id, user_id)
WHERE EXISTS (SELECT 1 FROM league_removed) AND
  (k.position <= 5 OR EXISTS (SELECT 1 FROM poke_lounge_league_season s WHERE s.id = :season AND s.settled_at IS NOT NULL));
UPDATE poke_lounge_league_record r
SET best_rank = CASE WHEN k.position <= 5 THEN LEAST(r.best_rank, k.position)::smallint ELSE r.best_rank END,
    final_rank = CASE WHEN s.settled_at IS NOT NULL THEN k.position::smallint ELSE r.final_rank END
FROM league_ranked k, poke_lounge_league_season s
WHERE r.season_id = k.season_id AND r.user_id = k.user_id AND s.id = r.season_id
  AND EXISTS (SELECT 1 FROM league_removed);
INSERT INTO poke_lounge_league_audit (operator, action, season_id, reason, before)
SELECT :'operator', 'hall_fix', :season, :'reason',
       COALESCE((SELECT jsonb_agg(to_jsonb(h) ORDER BY position) FROM poke_lounge_league_hall_of_fame h WHERE season_id = :season), '[]'::jsonb)
FROM poke_lounge_league_season WHERE id = :season AND settled_at IS NOT NULL
  AND EXISTS (SELECT 1 FROM league_removed);
DELETE FROM poke_lounge_league_hall_of_fame h USING poke_lounge_league_season s
WHERE h.season_id = s.id AND s.id = :season AND s.settled_at IS NOT NULL
  AND EXISTS (SELECT 1 FROM league_removed);
INSERT INTO poke_lounge_league_hall_of_fame (season_id, position, kind, user_id, npc_key, display_name, score, public_party)
SELECT k.season_id, k.position::smallint, 'player', k.user_id, NULL, k.display_name, k.score, k.public_party
FROM league_ranked k JOIN poke_lounge_league_season s ON s.id = k.season_id
WHERE k.position <= 5 AND s.settled_at IS NOT NULL AND EXISTS (SELECT 1 FROM league_removed);
WITH npc AS (
  SELECT s.id, n.value, row_number() OVER (ORDER BY (n.value->>'order')::integer) AS n
  FROM poke_lounge_league_season s CROSS JOIN LATERAL jsonb_array_elements(s.npc_seeds) n(value)
  WHERE s.id = :season AND s.settled_at IS NOT NULL
), players AS (SELECT count(*) AS n FROM league_ranked WHERE position <= 5)
INSERT INTO poke_lounge_league_hall_of_fame (season_id, position, kind, user_id, npc_key, display_name, score, public_party)
SELECT npc.id, (players.n + npc.n)::smallint, 'npc', NULL, value->>'npcKey', value->>'displayName', 0, value->'publicParty'
FROM npc, players WHERE npc.n <= 5 - players.n AND EXISTS (SELECT 1 FROM league_removed);
COMMIT;
SELECT user_id, score, best_rank, final_rank FROM poke_lounge_league_record
WHERE season_id = :season ORDER BY score DESC, accept_seq;
SELECT * FROM poke_lounge_league_hall_of_fame WHERE season_id = :season ORDER BY position;
SELECT * FROM poke_lounge_league_audit WHERE season_id = :season ORDER BY id DESC LIMIT 20;
```

## 8. 닉네임 강제 변경

NFC로 정규화한 2~~12자 이름을 정한다. 허용 문자: 한글 완성형, ASCII 영문·숫자, 히라가나 U+3041~~3096, 가타카나 U+30A1~~30FA·U+30FC, `_`. 공백·자모·결합 문자는 불가하다. NPC·관장 이름과 `NPC`, `운영자`, `관리자`, `admin`, `system`은 예약어다. 비교 키는 ASCII A~~Z만 a~z로 바꾼다. 과거 기록·명예의 전당 이름은 바꾸지 않는다.

```sql
\set nickname '새트레이너'
SELECT * FROM poke_lounge_league_profile WHERE user_id = :'user'::uuid;
SELECT * FROM poke_lounge_league_profile
WHERE nickname_key = translate(:'nickname', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz');
BEGIN;
SELECT user_id FROM poke_lounge_league_profile WHERE user_id = :'user'::uuid FOR UPDATE;
CREATE TEMP TABLE league_nickname ON COMMIT DROP AS SELECT :'nickname'::text AS value;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM league_nickname WHERE char_length(value) NOT BETWEEN 2 AND 12
             OR value <> normalize(value, NFC)
             OR value COLLATE "C" !~ '^[가-힣A-Za-z0-9ぁ-ゖァ-ヺー_]+$'
             OR translate(value, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz') IN ('npc','운영자','관리자','admin','system'))
     OR EXISTS (SELECT 1 FROM league_nickname v, poke_lounge_league_season s,
                LATERAL jsonb_array_elements(s.npc_seeds || s.badge_npcs) n
                WHERE translate(v.value, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz') =
                      translate(n->>'displayName', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')) THEN
    RAISE EXCEPTION '허용되지 않은 닉네임';
  END IF;
END $$;
INSERT INTO poke_lounge_league_audit (operator, action, user_id, reason, before)
SELECT :'operator', 'nickname_reset', user_id, :'reason', to_jsonb(p)
FROM poke_lounge_league_profile p WHERE user_id = :'user'::uuid;
UPDATE poke_lounge_league_profile
SET nickname = :'nickname', nickname_key = translate(:'nickname', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), updated_at = now()
WHERE user_id = :'user'::uuid;
COMMIT;
SELECT * FROM poke_lounge_league_profile WHERE user_id = :'user'::uuid;
```

고유 키 충돌은 트랜잭션 전체를 실패시킨다. 이후 일반 이름 변경에는 마지막 갱신부터 7일 제한이 적용된다.

## 9. 장애 대응

- 판정 장애: `league.settle_judge_unavailable`·`league.judge_failed` 확인. 입장·제출·발급·배지전은 503이거나 인증/계약 오류 시 500이 될 수 있다. 기존 `/health/ready`와 일반 방 생성·전투를 별도로 확인한다. 리그는 전용 DB 연결·판정 허가를 쓰고 Redis·기존 전투 워커를 쓰지 않는다.
- 리그 DB 장애: `league.db_unavailable` 확인. 전체 API를 리그 때문에 재기동하기 전에 리그 연결·마이그레이션을 점검한다. 기존 게임은 별도 연결을 쓴다.
- 정산 정지: 계획 없음+풀 없음(`league.season_plan_missing`), 무효 계획(`league.season_plan_invalid`), 판정 장애, 도전 대기(`league.settle_waiting`)를 구분한다. 계획 추가나 판정 복구 후 다음 60초 틱에 재시도한다. 잠금 충돌은 한 번 재시도하며 트랜잭션은 부분 반영되지 않는다.
- 장시간 중단: 재기동 첫 틱에서 정산한다. 다음 시즌은 정산 시각과 예정 시각 중 늦은 시각에 시작하고 마감은 달력을 유지한다. 정상 캘린더보다 27일 18시간 이상 늦으면 다음 시즌 마감이 시작보다 앞서 CHECK가 실패할 수 있다.

마지막 경우만 아래 `season_manual` 절차로 미정산 시즌의 기준 마감을 운영자가 새 일요일 18:00으로 재설정한다. 다음 시작은 그 뒤 월요일 00:00이다. 즉시 만들기 위해 잘못된 시각을 넣거나 T5 일부를 수동 실행하지 않는다. 이 조치로 기존 도전 대기 기한도 바뀌므로 실행 전 대상 도전을 검토하고 사유에 기록한다. 계획을 먼저 준비하며, 적용 후 정산은 정상 T5가 수행한다. 운영 설정의 grace가 6이 아니면 SQL의 6시간 대기 기한도 그 설정에 맞춘다.

```sql
\set recovery_close '2026-11-29T18:00:00+09:00'
SELECT *, now() AS db_now FROM poke_lounge_league_season WHERE id = :season;
SELECT id, status, entered_at FROM poke_lounge_league_attempt WHERE season_id = :season ORDER BY id;
BEGIN;
SELECT id FROM poke_lounge_league_season WHERE id = :season FOR UPDATE;
CREATE TEMP TABLE league_recovery ON COMMIT DROP AS SELECT :'recovery_close'::timestamptz AS closes;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM league_recovery WHERE
    extract(isodow FROM closes AT TIME ZONE 'Asia/Seoul') <> 7
    OR (closes AT TIME ZONE 'Asia/Seoul')::time <> time '18:00') THEN
    RAISE EXCEPTION '복구 마감은 KST 일요일 18:00이어야 함';
  END IF;
END $$;
INSERT INTO poke_lounge_league_audit (operator, action, season_id, reason, before)
SELECT :'operator', 'season_manual', id, :'reason', to_jsonb(s)
FROM poke_lounge_league_season s WHERE id = :season AND settled_at IS NULL;
UPDATE poke_lounge_league_season SET closes_at = :'recovery_close'::timestamptz,
  settle_deadline = :'recovery_close'::timestamptz + interval '6 hours'
WHERE id = :season AND settled_at IS NULL;
COMMIT;
SELECT id, closes_at, settle_deadline, settled_at FROM poke_lounge_league_season WHERE id = :season;
```

복구 마감은 기존 시작 이후이며 다음 시즌 마감이 현재보다 뒤가 되는 값으로 검토한다. 달력 재설정 사실과 지연 시간을 공지 절차에 기록한다. 이 문서는 외부 메시지를 자동 전송하지 않는다.

## 10. 데이터 보관

닫힌 run의 서버 세이브 사본만 시즌 정산 1주 뒤 선택적으로 삭제한다. 기록·발급·배지전·명예의 전당·감사 표는 이 절차에서 삭제하지 않는다. 감사에 세이브 원본을 남기므로 저장 공간 회수 효과는 제한적이며 운영 보관 정책을 우선한다.

```sql
SELECT r.id, s.settled_at, v.rev, v.size_bytes FROM poke_lounge_league_run r
JOIN poke_lounge_league_season s ON s.id = r.season_id
JOIN poke_lounge_league_run_save v ON v.run_id = r.id
WHERE s.id = :season AND r.status = 'closed' AND s.settled_at < now() - interval '7 days';
BEGIN;
SELECT id FROM poke_lounge_league_season WHERE id = :season FOR UPDATE;
SELECT id FROM poke_lounge_league_run WHERE season_id = :season ORDER BY id FOR UPDATE;
SELECT v.run_id FROM poke_lounge_league_run_save v JOIN poke_lounge_league_run r ON r.id = v.run_id
WHERE r.season_id = :season ORDER BY v.run_id FOR UPDATE OF v;
INSERT INTO poke_lounge_league_audit (operator, action, season_id, user_id, reason, before)
SELECT :'operator', 'season_manual', s.id, r.user_id, :'reason', to_jsonb(v)
FROM poke_lounge_league_run_save v JOIN poke_lounge_league_run r ON r.id = v.run_id
JOIN poke_lounge_league_season s ON s.id = r.season_id
WHERE s.id = :season AND r.status = 'closed' AND s.settled_at < now() - interval '7 days';
DELETE FROM poke_lounge_league_run_save v USING poke_lounge_league_run r, poke_lounge_league_season s
WHERE v.run_id = r.id AND r.season_id = s.id AND s.id = :season
  AND r.status = 'closed' AND s.settled_at < now() - interval '7 days';
COMMIT;
SELECT count(*) FROM poke_lounge_league_run_save v JOIN poke_lounge_league_run r ON r.id = v.run_id
WHERE r.season_id = :season;
```
