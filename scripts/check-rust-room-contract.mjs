import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
// TypeScript sources are read through the compiler's parser so formatting never matters.
const ts = createRequire(resolve(root, "packages/poke-lounge-battle/package.json"))("typescript");
const rustTokenPattern =
  /"(?:\\.|[^"\\])*"|\/\/[^\n]*|\/\*[\s\S]*?\*\/|[A-Za-z_][A-Za-z_0-9]*|[^\s]/g;

try {
  const rust = readRust("apps/api-rust/src/domain.rs");
  const roomTypes = parseTs(
    resolve(root, "apps/web/src/features/poke-lounge/contracts/rust-room.ts"),
  );

  for (const [name, variable, prefix, interfaceName] of [
    ["snapshot", "result", "RUST_ROOM_SNAPSHOT", "RustRoomSnapshot"],
    ["public", "value", "RUST_PARTICIPANT", "RustRoomParticipant"],
  ]) {
    const signature = onlyMatch(
      rust,
      new RegExp("\\bfn\\s+" + name + "\\([^)]*\\)\\s*->\\s*Value\\s*\\{", "g"),
      name + " function",
    );
    const body = bracedBlock(rust, signature.index + signature[0].length - 1);
    const literal = onlyMatch(
      body,
      new RegExp("\\blet\\s+mut\\s+" + variable + "\\s*=\\s*json!\\s*\\(\\s*\\{", "g"),
      name + " json! literal",
    );
    const object = bracedBlock(body, literal.index + literal[0].length - 1);
    const required = topLevelKeys(object);
    if (required.length === 0) throw new Error(name + " json! has no keys");
    const optional = [
      ...body.matchAll(new RegExp("\\b" + variable + '\\s*\\[\\s*"([^"]+)"\\s*\\]\\s*=', "g")),
    ].map(match => match[1]);

    compare(prefix + "_KEYS", required, tsStringArray(roomTypes, prefix + "_KEYS"));
    compare(
      prefix + "_OPTIONAL_KEYS",
      optional,
      tsStringArray(roomTypes, prefix + "_OPTIONAL_KEYS"),
    );
    compare(
      name + " / " + interfaceName,
      [...required, ...optional],
      // Actor adds serverNowMs after Room::snapshot, outside domain.rs.
      tsInterfaceKeys(roomTypes, interfaceName).filter(key => key !== "serverNowMs"),
    );
  }

  const tournament = readRust("apps/api-rust/src/tournament.rs");
  const battleSource = name =>
    parseTs(resolve(root, "packages/poke-lounge-battle/src", name + ".ts"));
  const bracketTypes = battleSource("tournament-bracket");

  // Nested snapshot shapes: Rust serde structs serialized into the snapshot vs TS interfaces.
  for (const [source, struct, file, name] of [
    [tournament, "Entrant", bracketTypes, "TournamentParticipant"],
    [tournament, "BracketMatch", bracketTypes, "TournamentMatch"],
    [tournament, "Bye", bracketTypes, "TournamentBye"],
    [tournament, "BracketRound", bracketTypes, "TournamentRound"],
    [tournament, "Elimination", bracketTypes, "TournamentElimination"],
    [tournament, "Bracket", bracketTypes, "TournamentBracketState"],
    [rust, "Round", roomTypes, "RustRoomRound"],
  ]) {
    compare(struct + " / " + name, rustStructKeys(source, struct), tsInterfaceKeys(file, name));
  }
  const rustSlots = rustEnum(tournament, "Slot");
  const tsSlots = tsTaggedUnion(bracketTypes, "TournamentRoundSlot", rustSlots.tag);
  compare(
    "Slot / TournamentRoundSlot kinds",
    rustSlots.variants.map(variant => variant.name),
    Object.keys(tsSlots),
  );
  for (const variant of rustSlots.variants) {
    compare("Slot." + variant.name, variant.fields, tsSlots[variant.name] ?? []);
  }

  // Match::projection builds the competitive projection as a json! literal.
  const projection = onlyMatch(
    rust,
    /\bfn\s+projection\([^)]*\)\s*->\s*Value\s*\{/g,
    "projection function",
  );
  const projectionBody = bracedBlock(rust, projection.index + projection[0].length - 1);
  const projectionLiteral = onlyMatch(projectionBody, /\bjson!\s*\(\s*\{/g, "projection json!");
  compare(
    "Match::projection / RustCompetitiveProjection",
    topLevelKeys(
      bracedBlock(projectionBody, projectionLiteral.index + projectionLiteral[0].length - 1),
    ),
    tsInterfaceKeys(roomTypes, "RustCompetitiveProjection"),
  );

  // Enum wire names: Rust serde names vs the TS arrays the worker validates against.
  compare(
    "Status / RUST_ROOM_STATUSES",
    rustEnum(rust, "Status").variants.map(variant => variant.name),
    tsStringArray(roomTypes, "RUST_ROOM_STATUSES"),
  );
  compare(
    "AiDifficulty / AI_DIFFICULTIES",
    rustEnum(rust, "AiDifficulty").variants.map(variant => variant.name),
    tsStringArray(battleSource("ai-difficulty"), "AI_DIFFICULTIES"),
  );
  compare(
    "StarterMode / STARTER_MODES",
    rustEnum(rust, "StarterMode").variants.map(variant => variant.name),
    tsStringArray(battleSource("starter-selection"), "STARTER_MODES"),
  );

  // Both compute.run and its battle wrapper take the operation as their third argument.
  const sentKinds = workerOperationKinds(rust);
  if (sentKinds.length === 0) throw new Error("No worker operation kinds found in domain.rs");
  const workerKinds = tsZodKinds(
    parseTs(resolve(root, "apps/battle-worker/src/protocol.ts")),
    "requestSchema",
  );
  if (workerKinds.length === 0) throw new Error("No operation kinds found in requestSchema");
  const unknownKinds = sentKinds.filter(kind => !workerKinds.includes(kind)).sort();
  if (unknownKinds.length) {
    console.error(
      "domain.rs sends worker operation kinds missing from apps/battle-worker/src/protocol.ts requestSchema: " +
        JSON.stringify(unknownKinds),
    );
    process.exitCode = 1;
  }
  const unusedKinds = workerKinds.filter(kind => !sentKinds.includes(kind)).sort();
  if (unusedKinds.length) {
    console.log(
      "note: worker operation kinds not sent by domain.rs: " + JSON.stringify(unusedKinds),
    );
  }

  if (!process.exitCode) console.log("rust room contract ok");
} catch (error) {
  console.error("Rust room contract extraction failed:", error.message);
  process.exitCode = 1;
}

function onlyMatch(source, pattern, label) {
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) throw new Error("Expected exactly one " + label);
  return matches[0];
}

function tokens(source) {
  return source.matchAll(rustTokenPattern);
}

function readRust(path) {
  const source = readFileSync(resolve(root, path), "utf8");
  return source.replace(rustTokenPattern, token =>
    token.startsWith("//") || token.startsWith("/*") ? " " : token,
  );
}

function bracedBlock(source, start) {
  let depth = 0;
  for (const token of tokens(source.slice(start))) {
    if (token[0] === "{") depth += 1;
    if (token[0] === "}" && --depth === 0) {
      return source.slice(start, start + token.index + 1);
    }
  }
  throw new Error("Unclosed Rust block");
}

function topLevelKeys(object) {
  const keys = [];
  let depth = 0;
  for (const token of tokens(object)) {
    if (["{", "[", "("].includes(token[0])) depth += 1;
    else if (["}", "]", ")"].includes(token[0])) depth -= 1;
    else if (
      depth === 1 &&
      token[0].startsWith('"') &&
      /^\s*:/.test(object.slice(token.index + token[0].length))
    ) {
      keys.push(JSON.parse(token[0]));
    }
  }
  return keys;
}

function workerOperationKinds(source) {
  const code = [...tokens(source)]
    .map(token => token[0])
    .filter(token => !token.startsWith("//") && !token.startsWith("/*"));
  // Consume one balanced group; strings and comments have already been tokenized separately.
  function group(list, start) {
    const stack = [];
    const closing = { "(": ")", "[": "]", "{": "}" };
    const parts = [[]];
    for (let index = start; index < list.length; index++) {
      const token = list[index];
      if (Object.hasOwn(closing, token)) stack.push(closing[token]);
      else if ([")", "]", "}"].includes(token)) {
        if (stack.pop() !== token) throw new Error("Unbalanced Rust compute operation");
        if (!stack.length) return parts;
      }
      if (index === start) continue;
      if (token === "," && stack.length === 1) parts.push([]);
      else parts.at(-1).push(token);
    }
    throw new Error("Unclosed Rust compute operation");
  }
  const kinds = [];
  for (let index = 0; index < code.length; index++) {
    if (
      code[index] !== "compute" ||
      code[index + 1] !== "." ||
      !["run", "battle"].includes(code[index + 2]) ||
      code[index + 3] !== "("
    )
      continue;
    const args = group(code, index + 3).filter(part => part.length);
    if (args.length !== (code[index + 2] === "battle" ? 4 : 3)) {
      throw new Error("Unexpected arguments to compute." + code[index + 2]);
    }
    let operation = args[2];
    if (operation.length === 1 && /^[A-Za-z_][A-Za-z_0-9]*$/.test(operation[0])) {
      const declarations = code.flatMap((token, at) =>
        token === operation[0] &&
        (code[at - 1] === "let" || (code[at - 2] === "let" && code[at - 1] === "mut")) &&
        code[at + 1] === "="
          ? [at + 2]
          : [],
      );
      if (declarations.length !== 1) throw new Error("Ambiguous compute operation " + operation[0]);
      operation = code.slice(declarations[0]);
    }
    if (operation.slice(0, 4).join(" ") !== "json ! ( {") {
      throw new Error("Expected a json! object for compute.run operation");
    }
    const fields = group(operation, 3).filter(field => field[0] === '"kind"' && field[1] === ":");
    if (fields.length !== 1 || fields[0].length !== 3 || !fields[0][2].startsWith('"')) {
      throw new Error("Expected one literal compute operation kind");
    }
    kinds.push(JSON.parse(fields[0][2]));
  }
  return [...new Set(kinds)];
}

function compare(name, rustKeys, typeKeys) {
  const expected = new Set(rustKeys);
  const actual = new Set(typeKeys);
  if (actual.size !== typeKeys.length) throw new Error("Duplicate key in " + name);
  const missing = [...expected].filter(key => !actual.has(key)).sort();
  const extra = [...actual].filter(key => !expected.has(key)).sort();
  if (missing.length || extra.length) {
    console.error(
      name + " differs: missing=" + JSON.stringify(missing) + ", extra=" + JSON.stringify(extra),
    );
    process.exitCode = 1;
  }
}

// --- Rust serde declarations -------------------------------------------------------------

function rustDeclaration(source, keyword, name) {
  const match = onlyMatch(
    source,
    new RegExp(
      "((?:#\\[[^\\]]*\\]\\s*)*)pub(?:\\([^)]*\\))?\\s+" + keyword + "\\s+" + name + "\\s*\\{",
      "g",
    ),
    "Rust " + keyword + " " + name,
  );
  const block = bracedBlock(source, match.index + match[0].length - 1);
  return { attributes: match[1], body: block.slice(1, -1) };
}

function serdeOption(attributes, option) {
  const serde = [...attributes.matchAll(/#\[serde\(([^\]]*)\)\]/g)].map(m => m[1]).join(",");
  return new RegExp("(?:^|[,\\s])" + option + '\\s*=\\s*"([^"]*)"').exec(serde)?.[1];
}

// Splits a struct or enum body into members at top-level commas, without comments.
function rustMembers(body) {
  const code = body.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "");
  const members = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index <= code.length; index++) {
    const char = code[index];
    if (char === '"') {
      index += 1;
      while (index < code.length && code[index] !== '"') index += code[index] === "\\" ? 2 : 1;
    } else if ("([{<".includes(char)) depth += 1;
    else if (")]}".includes(char) || (char === ">" && code[index - 1] !== "-")) depth -= 1;
    else if ((char === "," && depth === 0) || index === code.length) {
      const text = code.slice(start, index).trim();
      start = index + 1;
      if (!text) continue;
      const attributes = /^(?:#\[[^\]]*\]\s*)*/.exec(text)[0];
      members.push({ attributes, text: text.slice(attributes.length) });
    }
  }
  return members;
}

function rustFields(body, renameAll, label) {
  const keys = [];
  for (const { attributes, text } of rustMembers(body)) {
    const field = /^(?:pub(?:\([^)]*\))?\s+)?([a-z_][a-z0-9_]*)\s*:/.exec(text);
    if (!field) throw new Error("Unrecognized Rust field in " + label + ": " + text.slice(0, 40));
    if (/#\[serde\([^\]]*\b(?:flatten|skip_serializing\b|skip\b)/.test(attributes)) {
      throw new Error("Unsupported serde field attribute in " + label + "." + field[1]);
    }
    keys.push(serdeOption(attributes, "rename") ?? renameCase(field[1], renameAll, label));
  }
  return keys;
}

function rustStructKeys(source, name) {
  const { attributes, body } = rustDeclaration(source, "struct", name);
  return rustFields(body, serdeOption(attributes, "rename_all"), name);
}

function rustEnum(source, name) {
  const { attributes, body } = rustDeclaration(source, "enum", name);
  const renameAll = serdeOption(attributes, "rename_all");
  const variants = rustMembers(body).map(({ attributes: variantAttributes, text }) => {
    const variant = /^([A-Z][A-Za-z0-9]*)\s*(\{[\s\S]*\})?$/.exec(text);
    if (!variant)
      throw new Error("Unrecognized Rust variant in " + name + ": " + text.slice(0, 40));
    return {
      name:
        serdeOption(variantAttributes, "rename") ?? renameCase(variant[1], renameAll, name, true),
      fields: variant[2]
        ? rustFields(variant[2].slice(1, -1), undefined, name + "::" + variant[1])
        : [],
    };
  });
  return { tag: serdeOption(attributes, "tag"), variants };
}

function renameCase(identifier, renameAll, label, pascal = false) {
  const words = pascal
    ? identifier.match(/[A-Z][a-z0-9]*/g).map(word => word.toLowerCase())
    : identifier.split("_");
  if (renameAll === undefined) return identifier;
  if (renameAll === "lowercase") return words.join("");
  if (renameAll === "kebab-case") return words.join("-");
  if (renameAll === "snake_case") return words.join("_");
  if (renameAll === "camelCase") {
    return words
      .map((word, index) => (index ? word[0].toUpperCase() + word.slice(1) : word))
      .join("");
  }
  throw new Error("Unsupported serde rename_all " + renameAll + " on " + label);
}

// --- TypeScript declarations -------------------------------------------------------------

function parseTs(path) {
  return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
}

function memberNames(members, label) {
  return members.map(member => {
    if (
      !ts.isPropertySignature(member) ||
      !(ts.isIdentifier(member.name) || ts.isStringLiteral(member.name))
    ) {
      throw new Error("Unsupported member in TS type " + label);
    }
    return member.name.text;
  });
}

function tsInterfaceKeys(file, name) {
  const declarations = file.statements.filter(
    statement => ts.isInterfaceDeclaration(statement) && statement.name.text === name,
  );
  if (declarations.length !== 1) throw new Error("Expected exactly one TS interface " + name);
  const inherited = (declarations[0].heritageClauses ?? []).flatMap(clause =>
    clause.types.flatMap(type => tsInterfaceKeys(file, type.expression.getText(file))),
  );
  return [...inherited, ...memberNames(declarations[0].members, name)];
}

function tsExportedInitializer(file, name) {
  const declarations = file.statements
    .filter(ts.isVariableStatement)
    .flatMap(statement => [...statement.declarationList.declarations])
    .filter(declaration => ts.isIdentifier(declaration.name) && declaration.name.text === name);
  if (declarations.length !== 1 || !declarations[0].initializer) {
    throw new Error("Expected exactly one TS constant " + name);
  }
  let initializer = declarations[0].initializer;
  while (ts.isAsExpression(initializer) || ts.isParenthesizedExpression(initializer)) {
    initializer = initializer.expression;
  }
  return initializer;
}

function tsStringArray(file, name) {
  const initializer = tsExportedInitializer(file, name);
  if (
    !ts.isArrayLiteralExpression(initializer) ||
    !initializer.elements.every(element => ts.isStringLiteral(element))
  ) {
    throw new Error("Expected a string array literal for TS constant " + name);
  }
  return initializer.elements.map(element => element.text);
}

// { [tag value]: other keys } for a union of object type literals discriminated by `tag`.
function tsTaggedUnion(file, name, tag) {
  const declarations = file.statements.filter(
    statement => ts.isTypeAliasDeclaration(statement) && statement.name.text === name,
  );
  if (declarations.length !== 1) throw new Error("Expected exactly one TS type " + name);
  const type = declarations[0].type;
  const variants = {};
  for (const member of ts.isUnionTypeNode(type) ? type.types : [type]) {
    if (!ts.isTypeLiteralNode(member)) throw new Error("Unsupported union member in " + name);
    const tagMember = member.members.find(
      property => ts.isPropertySignature(property) && property.name.text === tag,
    );
    const literal = tagMember?.type;
    if (!literal || !ts.isLiteralTypeNode(literal) || !ts.isStringLiteral(literal.literal)) {
      throw new Error("Expected a string literal " + tag + " in every member of " + name);
    }
    variants[literal.literal.text] = memberNames(member.members, name).filter(key => key !== tag);
  }
  return variants;
}

// kind: z.literal("...") values inside the named zod schema.
function tsZodKinds(file, schemaName) {
  const kinds = [];
  function visit(node) {
    if (
      ts.isPropertyAssignment(node) &&
      node.name.text === "kind" &&
      ts.isCallExpression(node.initializer) &&
      ts.isPropertyAccessExpression(node.initializer.expression) &&
      node.initializer.expression.name.text === "literal" &&
      ts.isIdentifier(node.initializer.expression.expression) &&
      node.initializer.expression.expression.text === "z" &&
      node.initializer.arguments.length === 1 &&
      ts.isStringLiteral(node.initializer.arguments[0])
    ) {
      kinds.push(node.initializer.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(tsExportedInitializer(file, schemaName));
  return kinds;
}
