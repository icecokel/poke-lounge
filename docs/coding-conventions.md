# 코딩 컨벤션

저장소의 TypeScript와 JavaScript 코드에는 아래 규칙을 적용한다.

## 파일과 import

- 파일명은 `kebab-case`를 사용한다.
- 파일명과 관계없이 다른 모듈을 직접 또는 간접 re-export하는 배럴을 사용하지 않는다.
- re-export 전용 `index.ts`, `index.tsx`를 만들지 않는다.
- 배럴을 거치지 않고 구현 파일에서 직접 import한다.

```ts
import { createBattle } from "./battle/create-battle";
```

## 함수와 export

- 익명 함수는 사용하지 않는다. 콜백과 이벤트 핸들러도 이름 있는 함수로 선언한다.
- 내보내는 함수는 `export function 함수명()` 형태의 named export를 사용한다.
- `export const 함수명 = () => {}`와 익명 default export를 사용하지 않는다.
- 프레임워크가 default export를 요구하면 함수 이름을 명시한다.

```ts
export function createBattle() {}

function renderPlayer(player: Player) {
  return player.name;
}

players.map(renderPlayer);

export default function Page() {}
```

## 포맷과 정적 검사

- [Prettier 설정](../.prettierrc.json)을 포맷 기준으로 사용한다.
- 기본값은 2칸 들여쓰기, 세미콜론, trailing comma, 한 줄 100자다.
- API 코드는 작은따옴표, 한 줄 80자, 화살표 함수 매개변수 괄호를 사용한다.
- Web은 Next.js Core Web Vitals와 TypeScript ESLint 규칙을 따른다.
- API는 type-aware TypeScript ESLint와 Prettier 규칙을 따른다.
- TypeScript strict 설정을 유지한다.

## 검증

변경 범위에 맞는 검사를 실행한다.

```bash
pnpm format:check
pnpm lint
pnpm test
pnpm build
```
