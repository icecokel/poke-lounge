# Poke Lounge UI color palette

하트골드/소울실버의 밝은 패널과 명확한 상태색을 참고하되, 기존 Poke Lounge의 녹색·크림색·노란 선택색 무드를 유지한다.

| CSS 변수                    | 값        | 역할                     |
| --------------------------- | --------- | ------------------------ |
| `--pl-color-ink`            | `#24313B` | 외곽선, 본문, 강한 대비  |
| `--pl-color-ink-muted`      | `#52615E` | 보조 정보, 비활성 텍스트 |
| `--pl-color-surface`        | `#F5F2D8` | 기본 크림 패널           |
| `--pl-color-surface-raised` | `#FFFDF0` | 선택창과 상위 패널       |
| `--pl-color-surface-muted`  | `#DFE6D2` | 비활성·보조 면           |
| `--pl-color-shadow`         | `#8A958B` | 픽셀 패널 내부 그림자    |
| `--pl-color-johto`          | `#5F8F70` | 기본 액션과 선택 표시    |
| `--pl-color-johto-deep`     | `#315D4B` | 선택 외곽선과 강조       |
| `--pl-color-gold`           | `#F4CF58` | 선두 포켓몬과 핵심 선택  |
| `--pl-color-gold-soft`      | `#FFF1A8` | 선택 배경과 호버         |
| `--pl-color-blue`           | `#5B87A7` | 랭크·정보 계열 보조색    |
| `--pl-color-red`            | `#C9534C` | 전투·위험 행동 강조      |
| `--pl-color-hp`             | `#58A957` | 안정 HP                  |
| `--pl-color-warning`        | `#DDA83F` | 주의 HP·경고             |
| `--pl-color-danger`         | `#C84C45` | 위험 HP·오류·전투불능    |
| `--pl-color-focus`          | `#2F6B78` | 키보드 포커스 링         |

## 사용 규칙

- 한 화면의 기본 강조색은 `johto` 하나를 사용한다.
- `gold`는 현재 선택 또는 선두 상태에만 사용한다.
- `blue`, `red`, HP 상태색은 의미가 있는 정보에만 사용한다.
- 패널은 `surface`와 `surface-raised`, 외곽선은 `ink`로 통일한다.
- 새로운 화면별 임의 색상은 추가하지 않고 먼저 이 팔레트에서 조합한다.

코드 기준 파일: `apps/web/src/components/poke-lounge/poke-lounge-theme.module.css`
