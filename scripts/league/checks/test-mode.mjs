import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const self = fileURLToPath(import.meta.url);
// Reuse @eslint/eslintrc's declared YAML dependency without adding a package.
const webRequire = createRequire(resolve(root, "apps/web/package.json"));
const {
  load: parseYaml,
  Type,
  DEFAULT_SCHEMA,
} = createRequire(webRequire.resolve("@eslint/eslintrc/package.json"))("js-yaml");
const composeSchema = DEFAULT_SCHEMA.extend(
  ["!reset", "!override"].flatMap(tag =>
    ["scalar", "sequence", "mapping"].map(kind => new Type(tag, { kind })),
  ),
);
const setting =
  /\b(?:LEAGUE_TEST_[A-Z_]+|NEXT_PUBLIC_LEAGUE_TEST_MODE|LEAGUE_DEV_SEASON_MINUTES)\b/g;
const errors = [];
const read = path => readFileSync(path, "utf8");
const name = path => relative(root, path).replaceAll("\\", "/");
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? files(path) : entry.isFile() ? [path] : [];
  });
}
function reject(path, pattern, reason) {
  if (pattern.test(read(path))) errors.push(`${name(path)}: ${reason}`);
}

// 1. Production configuration must never carry local test settings.
const configurationFiles = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: root, encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean)
  .filter(file => file !== "compose.rust-local.yaml" && !file.startsWith("scripts/rust-local/"))
  .map(file => resolve(root, file))
  .filter(existsSync);
// Includes all eight default/override names Compose can discover without -f.
const composeFile = /^(?:docker-)?compose(?:[.-].*)?\.ya?ml$/;
const production = new Set(
  configurationFiles.filter(path => {
    const file = basename(path);
    return (
      composeFile.test(file) ||
      file.startsWith("Dockerfile") ||
      file === "package.json" ||
      /^apps\/[^/]+\/\.env[^/]*$/.test(name(path)) ||
      /^apps\/web\/next\.config\.[^/]+$/.test(name(path)) ||
      /^\.github\/workflows\/[^/]+\.ya?ml$/.test(name(path))
    );
  }),
);
const list = value => (value == null ? [] : Array.isArray(value) ? value : [value]);
const outside = path => {
  const localPath = relative(realpathSync(root), path);
  return isAbsolute(localPath) || localPath === ".." || localPath.startsWith("../");
};
function reference(source, target, key, base = dirname(source), directory = false) {
  if (typeof target !== "string" || !target || target.includes("$")) {
    errors.push(
      `${name(source)}: ${key} requires a literal ${directory ? "directory" : "file"} path`,
    );
    return null;
  }
  const path = resolve(base, target);
  if (outside(path) || (existsSync(path) && outside(realpathSync(path)))) {
    errors.push(`${name(source)}: ${key} must stay inside the repository`);
  } else if (!existsSync(path)) {
    errors.push(`${name(source)}: ${key} ${name(path)} is missing`);
  } else if (directory ? !statSync(path).isDirectory() : !statSync(path).isFile()) {
    errors.push(
      `${name(source)}: ${key} ${name(path)} is not a ${directory ? "directory" : "file"}`,
    );
  } else {
    if (!directory) production.add(path);
    return path;
  }
  return null;
}
function envFiles(source, entries, base) {
  for (const entry of list(entries))
    reference(source, typeof entry === "string" ? entry : entry?.path, "env_file", base);
}

// Follow production references even when their names or Git ignore rules would exempt them.
const pending = configurationFiles
  .filter(path => composeFile.test(basename(path)))
  .map(path => ({ path, base: dirname(path), standalone: true }));
const visited = new Set();
const composeProjects = [];
for (const { path, base, standalone } of pending) {
  const key = `${realpathSync(path)}\0${base}`;
  if (visited.has(key)) continue;
  let compose;
  try {
    compose = parseYaml(read(path), { schema: composeSchema });
  } catch (error) {
    errors.push(`${name(path)}: YAML 해석 실패: ${error.message.split("\n")[0]}`);
    continue;
  }
  // Preserve the existing local-only compatibility alias, never an operational reference to it.
  if (
    standalone &&
    name(path) === "compose.rust.yaml" &&
    Object.keys(compose ?? {}).length === 1 &&
    Array.isArray(compose.include) &&
    compose.include.length === 1 &&
    compose.include[0] === "compose.rust-local.yaml"
  )
    continue;
  visited.add(key);
  if (standalone) composeProjects.push(path);
  for (const entry of list(compose?.include)) {
    const targets = list(typeof entry === "string" ? entry : entry?.path);
    if (!targets.length) {
      errors.push(`${name(path)}: include requires a literal file path`);
      continue;
    }
    const includes = targets
      .map(target => reference(path, target, "include", base))
      .filter(Boolean);
    if (!includes.length) continue;
    const projectDirectory =
      entry?.project_directory === undefined
        ? dirname(includes[0])
        : reference(path, entry.project_directory, "include.project_directory", base, true);
    if (!projectDirectory) continue;
    envFiles(path, entry?.env_file, base);
    for (const include of includes) pending.push({ path: include, base: projectDirectory });
  }
  for (const service of Object.values(compose?.services ?? {})) {
    envFiles(path, service?.env_file, base);
    if (service?.extends?.file !== undefined) {
      const extended = reference(path, service.extends.file, "extends.file", base);
      if (extended) pending.push({ path: extended, base: dirname(extended) });
    }
  }
}
// Compose resolves inheritance, include path lists, and tags before choosing build files.
if (!errors.length)
  for (const path of composeProjects) {
    const projectFiles = [path];
    if (/^(?:docker-)?compose\.override\.ya?ml$/.test(basename(path))) {
      const base = ["compose.yaml", "compose.yml", "docker-compose.yaml", "docker-compose.yml"]
        .map(file => resolve(dirname(path), file))
        .find(file => composeProjects.includes(file));
      if (base) projectFiles.unshift(base);
    }
    let compose;
    try {
      compose = JSON.parse(
        execFileSync(
          "docker",
          [
            "compose",
            ...projectFiles.flatMap(file => ["-f", file]),
            "config",
            "--format",
            "json",
            "--no-interpolate",
            "--no-env-resolution",
            "--no-consistency",
          ],
          { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 10000 },
        ),
      );
    } catch {
      errors.push(`${name(path)}: Docker Compose config failed; Docker Compose is required`);
      continue;
    }
    for (const service of Object.values(compose.services ?? {})) {
      envFiles(path, service.env_file);
      if (!service.build) continue;
      const context = reference(path, service.build.context, "build.context", root, true);
      if (context && service.build.dockerfile_inline === undefined)
        reference(path, service.build.dockerfile ?? "Dockerfile", "build.dockerfile", context);
    }
  }
for (const path of production) {
  for (const match of read(path).matchAll(setting))
    errors.push(`${name(path)}: production setting ${match[0]} is forbidden`);
}

// 2. Local compose only accepts unset pass-through entries in these two services.
let inServices = false;
let service = null;
let inEnvironment = false;
for (const [index, line] of read(resolve(root, "compose.rust-local.yaml"))
  .split(/\r?\n/)
  .entries()) {
  if (/^\S/.test(line) && !line.startsWith("#")) inServices = line === "services:";
  const serviceMatch = /^ {2}([\w-]+):\s*$/.exec(line);
  if (serviceMatch) {
    service = inServices ? serviceMatch[1] : null;
    inEnvironment = false;
  }
  if (/^ {4}\S/.test(line)) inEnvironment = /^ {4}environment:\s*$/.test(line);
  for (const match of line.matchAll(setting)) {
    if (
      !inServices ||
      !["api-rust", "league-judge"].includes(service) ||
      !inEnvironment ||
      !new RegExp(`^ {6}${match[0]}:\\s*$`).test(line)
    )
      errors.push(`compose.rust-local.yaml:${index + 1}: invalid pass-through ${match[0]}`);
  }
}

// 3, 8. Rust test settings and season acceleration stay in their owning modules.
for (const path of files(resolve(root, "apps/api-rust/src")).filter(path => path.endsWith(".rs"))) {
  if (name(path) !== "apps/api-rust/src/league/test_mode.rs")
    reject(path, /LEAGUE_TEST_|\+test\./, "test mode belongs in league/test_mode.rs");
  if (name(path) !== "apps/api-rust/src/league/season.rs")
    reject(path, /LEAGUE_DEV_SEASON_MINUTES/, "season acceleration belongs in league/season.rs");
}

// 4. B owns the judge module; its version migration becomes required when it exists.
const judgeMode = resolve(root, "apps/league-judge/src/test-mode.ts");
for (const path of files(resolve(root, "apps/league-judge/src"))) {
  if (path !== judgeMode)
    reject(path, /LEAGUE_TEST_|\+test\./, "test mode belongs in test-mode.ts");
  // T0 precedes B: the unchanged judge still uses the production engine version.
  if (existsSync(judgeMode) && path !== judgeMode)
    reject(path, /\bLEAGUE_ENGINE_VERSION\b/, "use JUDGE_ENGINE_VERSION from test-mode.ts");
}

// 5. Shared package sources must not know about test mode.
for (const entry of readdirSync(resolve(root, "packages"), { withFileTypes: true })) {
  const source = resolve(root, "packages", entry.name, "src");
  if (!entry.isDirectory() || !existsSync(source)) continue;
  for (const path of files(source))
    reject(path, /LEAGUE_TEST_|\+test\./, "test mode is forbidden in shared package sources");
}

// 6. Web build markers and the server-only token each have a single boundary.
const loginRoute = resolve(root, "apps/web/src/app/api/league-test/login/route.ts");
for (const path of files(resolve(root, "apps/web/src"))) {
  if (!name(path).startsWith("apps/web/src/features/league/test-mode/"))
    reject(
      path,
      /NEXT_PUBLIC_LEAGUE_TEST_MODE|\+test\./,
      "test markers belong in league/test-mode",
    );
  if (path !== loginRoute)
    reject(path, /LEAGUE_TEST_LOGIN_TOKEN/, "login token belongs in the server login route");
}
// C creates this route after T0; once present it must include both local guards.
if (existsSync(loginRoute)) {
  const code = read(loginRoute);
  if (!code.includes('process.env.NODE_ENV !== "development"') || !code.includes('"localhost"'))
    errors.push(`${name(loginRoute)}: development and localhost guards are required`);
  reject(
    loginRoute,
    /\b(?:from\s*|import\s*(?:\(\s*)?|require\s*\(\s*)["'][^"']*(?:features\/league|@\/lib\/local-test-account)/,
    "login route must not import league features or the multiplayer test account helper",
  );
}

// 7. Only the local launcher may mention these settings in scripts.
for (const path of files(resolve(root, "scripts"))) {
  if (path === self || name(path) === "scripts/rust-local/dev.ts") continue;
  for (const match of read(path).matchAll(setting))
    errors.push(`${name(path)}: only rust-local/dev.ts may mention ${match[0]}`);
}

if (errors.length) throw new Error(`League test mode boundary violations:\n${errors.join("\n")}`);
console.log(
  "League test mode static checks passed (rules 1–8; judge/login guards apply when added).",
);
