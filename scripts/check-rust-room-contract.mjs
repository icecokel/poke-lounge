import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

try {
  const rust = readFileSync(resolve(root, "apps/api-rust/src/domain.rs"), "utf8");
  const types = readFileSync(
    resolve(root, "apps/web/src/features/poke-lounge/contracts/rust-room.ts"),
    "utf8",
  );

  for (const [name, variable, prefix] of [
    ["snapshot", "result", "RUST_ROOM_SNAPSHOT"],
    ["public", "value", "RUST_PARTICIPANT"],
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

    compare(prefix + "_KEYS", required, readTypeKeys(types, prefix + "_KEYS"));
    compare(prefix + "_OPTIONAL_KEYS", optional, readTypeKeys(types, prefix + "_OPTIONAL_KEYS"));
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
  return source.matchAll(/"(?:\\.|[^"\\])*"|\/\/[^\n]*|\/\*[\s\S]*?\*\/|[{}]/g);
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
    if (token[0] === "{") depth += 1;
    else if (token[0] === "}") depth -= 1;
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

function readTypeKeys(source, name) {
  const match = onlyMatch(
    source,
    new RegExp("export\\s+const\\s+" + name + "\\s*=\\s*\\[([^\\]]*)\\]\\s*as\\s+const", "g"),
    name + " array",
  );
  const values = match[1];
  if (values.replace(/"[^"\\]*"|[\s,]/g, "") !== "") {
    throw new Error("Expected only string keys in " + name);
  }
  return [...values.matchAll(/"([^"\\]*)"/g)].map(key => key[1]);
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
