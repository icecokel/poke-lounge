import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

describe('production migration identities', () => {
  it('keeps migration filename timestamps and exported class names unique', () => {
    const migrationFiles = readdirSync(__dirname)
      .filter(
        (fileName) =>
          /^\d{13}-.*\.ts$/.test(fileName) && !fileName.endsWith('.spec.ts'),
      )
      .sort();
    const timestamps = migrationFiles.map((fileName) => fileName.slice(0, 13));
    const classNames = migrationFiles.flatMap(readExportedClassNames);

    expect(new Set(timestamps).size).toBe(timestamps.length);
    expect(new Set(classNames).size).toBe(classNames.length);
    expect(timestamps).toContain('1794441600000');
  });
});

function readExportedClassNames(fileName: string): string[] {
  const sourcePath = join(__dirname, fileName);
  const sourceFile = ts.createSourceFile(
    sourcePath,
    readFileSync(sourcePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  return sourceFile.statements.flatMap((statement) => {
    if (!ts.isClassDeclaration(statement) || !statement.name) {
      return [];
    }
    const isExported = statement.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    );
    return isExported ? [statement.name.text] : [];
  });
}
