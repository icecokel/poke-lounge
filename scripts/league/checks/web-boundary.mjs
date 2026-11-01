import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const source = resolve(root, "apps/web/src");
const ts = createRequire(resolve(root, "apps/web/package.json"))("typescript");
const leaguePrefix = "features/league/";
const entryLink = `${leaguePrefix}entry-link/league-entry-link.tsx`;
const trainer = "components/poke-lounge/runtime/game/ui/trainer-name-entry.tsx";
const errors = [];
const mobileShell = "features/league/growth/mobile-field-shell.tsx";
const sharedMobileShell = "components/poke-lounge/mobile/mobile-game-shell.tsx";
const shellOwners = new Set(["components/poke-lounge/poke-lounge-game.tsx", mobileShell]);
const challengerBridges = new Set([
  "components/poke-lounge/runtime/game/create-poke-lounge-game.ts",
  "components/poke-lounge/runtime/game/scenes/world-scene.ts",
]);
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? files(path) : /\.[cm]?[jt]sx?$/.test(entry.name) ? [path] : [];
  });
}
function imports(text) {
  return [
    ...text.matchAll(/\b(?:from\s*|import\s*(?:\(\s*)?|require\s*\(\s*)["']([^"']+)["']/g),
  ].map(match => match[1]);
}
for (const path of files(source)) {
  const name = relative(source, path).replaceAll("\\", "/");
  const text = readFileSync(path, "utf8");
  if (!name.startsWith(leaguePrefix)) {
    if (text.includes("fieldChallenger") && !challengerBridges.has(name))
      errors.push(`${name}: fieldChallenger is restricted to league and its two shared bridges`);
    if (/\b(?:getPosition|consumeContact)\b/.test(text)) {
      const tree = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
      function visit(node) {
        if (ts.isObjectLiteralExpression(node)) {
          for (const property of node.properties) {
            if (
              property.name &&
              (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
              ["getPosition", "consumeContact"].includes(property.name.text)
            )
              errors.push(
                `${name}: challenger position/contact hooks may only be supplied by league`,
              );
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(tree);
    }
  }
  const tree = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  function checkMobileBoundary(node) {
    if (ts.isJsxAttribute(node)) {
      const attribute = node.name.getText();
      if (
        (attribute === "data-poke-lounge-mobile-shell" ||
          (attribute === "data-testid" &&
            node.initializer &&
            ts.isStringLiteral(node.initializer) &&
            node.initializer.text === "poke-lounge-page")) &&
        !shellOwners.has(name)
      )
        errors.push(`${name}: mobile shell markers are restricted to the two field shells`);
    }
    if (
      name.startsWith(leaguePrefix) &&
      name !== mobileShell &&
      ts.isImportSpecifier(node) &&
      (node.propertyName ?? node.name).text === "MobileExploreDeck"
    )
      errors.push(`${name}: only the league mobile field shell may import MobileExploreDeck`);
    ts.forEachChild(node, checkMobileBoundary);
  }
  checkMobileBoundary(tree);
  const targets = imports(text);
  for (const target of targets) {
    const resolved = target.startsWith("@/")
      ? resolve(source, target.slice(2))
      : target.startsWith(".")
        ? resolve(dirname(path), target)
        : null;
    if (!resolved) continue;
    const imported = relative(source, resolved).replaceAll("\\", "/");
    if (imported !== "features/league" && !imported.startsWith(leaguePrefix)) continue;
    if (name.startsWith(leaguePrefix) || name.startsWith("app/[locale]/league/")) continue;
    if (
      name === trainer &&
      /^features\/league\/entry-link\/league-entry-link(?:\.[jt]sx?)?$/.test(imported)
    )
      continue;
    errors.push(`${name}: league import is outside the allowed boundary (${target})`);
  }
  if (name === entryLink) {
    for (const target of targets) {
      if (target !== "react" && target !== "@/lib/constants")
        errors.push(`${name}: entry link may only import React and getApiBaseUrl (${target})`);
    }
  }
  if (!name.startsWith(leaguePrefix)) continue;
  if (/["'`]poke-lounge:/.test(text))
    errors.push(`${name}: multiplayer storage keys are forbidden`);
  if (/\b(?:getDefaultGameStateStore|createLocalPreviewRoom)\b/.test(text))
    errors.push(`${name}: multiplayer default stores and preview rooms are forbidden`);
}
// Compare complete AST nodes: suffix operations and stale comments must not pass.
const printer = ts.createPrinter({ removeComments: true });
function parse(path, text = readFileSync(path, "utf8")) {
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
}
function findNode(node, predicate) {
  if (!node) return undefined;
  if (predicate(node)) return node;
  return ts.forEachChild(node, child => findNode(child, predicate));
}
function namedFunction(tree, name) {
  return tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
}
function checkNode(actual, expected, label) {
  const print = node => printer.printNode(ts.EmitHint.Unspecified, node, node.getSourceFile());
  if (!actual || print(actual) !== print(expected))
    errors.push(`${label}: gym-roam NPC contract changed`);
}
function checkExpression(actual, expected, label) {
  const tree = parse("contract.tsx", `const value = ${expected};`);
  checkNode(actual, tree.statements[0].declarationList.declarations[0].initializer, label);
}
const rendererPath = resolve(source, "components/poke-lounge/runtime/game/world/world-screen.tsx");
const actor = namedFunction(parse(rendererPath), "NpcActor");
const image = findNode(
  actor?.body,
  node => ts.isJsxSelfClosingElement(node) && node.tagName.getText() === "img",
);
if (image?.attributes.properties.some(ts.isJsxSpreadAttribute))
  errors.push("NpcActor.img: spread attributes can override the gym-roam NPC contract");
for (const [name, expected] of [
  ["data-world-npc", "npc.name"],
  ["src", "npc.imageUrl"],
  [
    "style",
    `{
    height: config.displaySize.height,
    left: npc.x - config.displaySize.width / 2,
    top: npc.y - config.displaySize.height,
    width: config.displaySize.width,
  }`,
  ],
]) {
  const attributes = image?.attributes.properties.filter(
    node => ts.isJsxAttribute(node) && node.name.getText() === name,
  );
  const initializer = attributes?.length === 1 ? attributes[0].initializer : undefined;
  checkExpression(
    initializer && ts.isJsxExpression(initializer) ? initializer.expression : undefined,
    expected,
    `NpcActor.img.${name}`,
  );
}
for (const [path, name, body] of [
  [
    "packages/poke-lounge-battle/src/adventure/world/world-runtime-motion.ts",
    "getNpcHitbox",
    `{
    const config = FIELD_MAP.npcs[npc.name];
    const scaleX = config.displaySize.width / 32;
    const scaleY = config.displaySize.height / 32;
    const spriteLeft = npc.x - config.displaySize.width / 2;
    const spriteTop = npc.y - config.displaySize.height;
    const left = spriteLeft + config.hitbox.offsetX * scaleX;
    const top = spriteTop + config.hitbox.offsetY * scaleY;
    return {
      bottom: top + config.hitbox.height * scaleY,
      left,
      right: left + config.hitbox.width * scaleX,
      top,
    };
  }`,
  ],
  [
    "apps/web/src/features/league/growth/gym-roam.ts",
    "gymHitbox",
    `{
    const { displaySize, hitbox } = FIELD_MAP.npcs.soloChallenger;
    const scaleX = displaySize.width / 32;
    const scaleY = displaySize.height / 32;
    const left = position.x - displaySize.width / 2 + hitbox.offsetX * scaleX;
    const top = position.y - displaySize.height + hitbox.offsetY * scaleY;
    return { left, top, right: left + hitbox.width * scaleX, bottom: top + hitbox.height * scaleY };
  }`,
  ],
]) {
  const actual = namedFunction(parse(resolve(root, path)), name)?.body;
  const expected = parse("contract.ts", `function contract() ${body}`).statements[0].body;
  checkNode(actual, expected, `${path}:${name}`);
}
for (let leader = 1; leader <= 8; leader++) {
  for (let frame = 1; frame <= 16; frame++) {
    const asset = `apps/web/public/assets/poke-lounge/textures/a_0_8_1_${String(145 + leader).padStart(4, "0")}/gsleader${leader}_${frame}.png`;
    if (!existsSync(resolve(root, asset))) errors.push(`${asset}: gym walking frame is missing`);
  }
}
// Fingerprint the b23fd1b shared sources, normalizing only the approved export.
// This also works in CI's shallow checkout, without fetching the baseline commit.
const protectedPaths = [
  "apps/web/src/components",
  "apps/web/src/app",
  "apps/web/src/features/poke-lounge",
  "packages",
];
const protectedFiles = [
  ...new Set(
    execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", ...protectedPaths],
      { cwd: root, encoding: "utf8" },
    )
      .split("\0")
      .filter(Boolean),
  ),
].sort();
const sharedHash = createHash("sha256");
for (const name of protectedFiles) {
  let content = readFileSync(resolve(root, name));
  if (name === `apps/web/src/${sharedMobileShell}`) {
    const text = content.toString("utf8");
    if ((text.match(/export function MobileExploreDeck\(/g) ?? []).length !== 1)
      errors.push(`${name}: MobileExploreDeck must have exactly the approved export`);
    content = Buffer.from(
      text.replace("export function MobileExploreDeck(", "function MobileExploreDeck("),
    );
  }
  sharedHash.update(name).update("\0").update(content).update("\0");
}
if (sharedHash.digest("hex") !== "79b9d151f78273ccad718861b1b3bfdc23cbf0b3f6b5ffd57c01512f5ce28185")
  errors.push(
    "shared sources differ from b23fd1b beyond the MobileExploreDeck export; review the multiplayer boundary",
  );
for (const [name, selector] of [
  ["components/poke-lounge/mobile/mobile-task-screen.tsx", "[data-testid='poke-lounge-page']"],
  [
    "components/poke-lounge/runtime/game/ui/mobile-ui-capability.ts",
    "[data-poke-lounge-mobile-shell='true']",
  ],
  ["components/poke-lounge/mobile/mobile-play-layout-binding.ts", "[data-poke-lounge-play-status]"],
]) {
  const tree = parse(resolve(source, name));
  if (!findNode(tree, node => ts.isStringLiteral(node) && node.text === selector))
    errors.push(`${name}: league mobile shell DOM contract changed (${selector})`);
}
const layoutBinding = parse(
  resolve(source, "components/poke-lounge/mobile/mobile-play-layout-binding.ts"),
);
if (
  !findNode(
    layoutBinding,
    node =>
      ts.isPropertyAccessExpression(node) && node.getText() === "page.dataset.pokeLoungePlayLayout",
  )
)
  errors.push("mobile-play-layout-binding.ts: league play layout flag contract changed");
if (errors.length) throw new Error(`League web boundary violations:\n${errors.join("\n")}`);
console.log(
  "League web boundary: imports, storage, explicit stores, challenger opt-in, NPC rendering/hitboxes, 128 gym frames, mobile shell contracts, and the export-only shared diff verified.",
);
