import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createLocalOpenApiDocument } from '../src/api-contract';

const parseOutputPath = (args: string[]): string => {
  const outputFlagIndex = args.indexOf('--output');
  const outputFromFlag =
    outputFlagIndex >= 0 ? args[outputFlagIndex + 1] : undefined;
  const output =
    outputFromFlag || process.env.OPENAPI_OUTPUT_PATH || 'openapi.json';

  return resolve(process.cwd(), output);
};

const main = async () => {
  const outputPath = parseOutputPath(process.argv.slice(2));
  const document = await createLocalOpenApiDocument();
  const json = `${JSON.stringify(document, null, 2)}\n`;

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, json, 'utf8');
  process.stdout.write(`OpenAPI contract written to ${outputPath}\n`);
};

void main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
