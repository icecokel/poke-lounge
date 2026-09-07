import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import test from "node:test";
import ts from "typescript";

const root = resolve("src/features/poke-lounge");
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory()
      ? files(join(dir, entry.name))
      : /\.tsx?$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)
        ? [join(dir, entry.name)]
        : [],
  );
}
function isTypeOnly(node: ts.ImportDeclaration): boolean {
  if (node.importClause?.isTypeOnly) return true;
  const bindings = node.importClause?.namedBindings;
  return (
    !node.importClause?.name &&
    Boolean(
      bindings &&
      ts.isNamedImports(bindings) &&
      bindings.elements.length > 0 &&
      bindings.elements.every(e => e.isTypeOnly),
    )
  );
}
for (const layer of ["application", "domain"]) {
  test(`${layer} 계층은 UI·DOM·네트워크 구현에 런타임 의존하지 않는다`, () => {
    const issues: string[] = [];
    for (const path of files(join(root, layer))) {
      const source = ts.createSourceFile(
        path,
        readFileSync(path, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      const label = relative(root, path);
      if (path.endsWith(".tsx")) issues.push(`${label}: JSX file in core`);
      const visit = (node: ts.Node): void => {
        if (
          ts.isImportDeclaration(node) &&
          ts.isStringLiteral(node.moduleSpecifier) &&
          !isTypeOnly(node)
        ) {
          const spec = node.moduleSpecifier.text;
          if (
            /^(react(?:\/|$)|next(?:\/|$)|socket\.io|@\/components\/|@\/services\/)/.test(spec) ||
            spec.includes("/presentation/") ||
            spec.includes("/adapters/")
          )
            issues.push(`${label}: ${spec}`);
        }
        if (
          ts.isIdentifier(node) &&
          ["window", "document", "navigator", "localStorage", "sessionStorage", "fetch"].includes(
            node.text,
          )
        )
          issues.push(`${label}: browser global ${node.text}`);
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    assert.deepEqual(issues, []);
  });
}
test("계약 계층은 타입만 내보내며 구현이나 실행 정책을 포함하지 않는다", () => {
  const issues: string[] = [];
  for (const path of files(join(root, "contracts"))) {
    const source = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    for (const node of source.statements) {
      const allowed =
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        (ts.isImportDeclaration(node) && isTypeOnly(node)) ||
        (ts.isExportDeclaration(node) && node.isTypeOnly) ||
        ts.isEmptyStatement(node);
      if (!allowed) issues.push(relative(root, path) + ": " + ts.SyntaxKind[node.kind]);
    }
  }
  assert.deepEqual(issues, []);
});
test("출발 오버레이는 준비 요청·저장소 구독·타이머를 직접 실행하지 않는다", () => {
  const text = readFileSync(
    resolve("src/components/poke-lounge/runtime/game/round/round-start-overlay.tsx"),
    "utf8",
  );
  assert.doesNotMatch(
    text,
    /useEffect|useSyncExternalStore|gameStateStore|frameStore|onPreparationReady|requestAnimationFrame|Date\.now/,
  );
  assert.match(text, /RoundStartView/);
});
