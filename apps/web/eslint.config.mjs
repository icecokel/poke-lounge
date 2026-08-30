/**
 * ESLint Configuration (Flat Config - ESLint 9+)
 *
 * Next.js 프로젝트 ESLint 설정
 * - next/core-web-vitals: Next.js 권장 규칙 + Core Web Vitals 최적화 규칙
 * - next/typescript: TypeScript 관련 규칙
 *
 * @see https://nextjs.org/docs/app/api-reference/config/eslint
 * @see https://eslint.org/docs/latest/use/configure/configuration-files
 */
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// FlatCompat: 기존 eslintrc 스타일 설정을 flat config로 변환
const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      ".next-e2e*/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      "**/*.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default eslintConfig;
