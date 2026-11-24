import { readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const scriptPath = fileURLToPath(import.meta.url);
const webConfig = resolve(dirname(scriptPath), "../packages/web/tsconfig.json");
const baselinePath = resolve(dirname(scriptPath), "check-architecture-baseline.json");
const legacyLayers = ["shared", "entities", "features", "widgets", "pages", "app"];
const messenger = "applications/messenger/";
const model = messenger + "model/";
const messengerDirections = {
  pages: ["features", "model"],
  features: ["model"],
  model: [],
  runtime: ["model"],
};
const users = "modules/users/";
const usersPublicEntries = new Set([
  "users.ts",
  "users-profile.ts",
  "users-runtime.ts",
  "users-selectors.ts",
  "users-types.ts",
]);
const platform = "platform/";

// Only explicitly private Messenger stores and delivery/history implementations are checked here.
const privateFiles = [
  [model + "chats/", "messenger.model.ts"],
  [model + "messages/", "message.model.ts"],
  [model + "messages/", "history/"],
  [model + "messages/", "outgoing/"],
  [model + "drafts/", "composer-draft.model.ts"],
];

const rules = {
  "legacy-direction": "Legacy layers depend on lower layers.",
  "application-direction":
    "Shared and entities stay below applications, and applications stay below app.",
  "messenger-direction":
    "Messenger pages and runtime compose the public model and feature operations.",
  "messenger-private":
    "Consume Messenger stores and workflows through their owning model's public operations.",
  "messenger-lazy-entry": "Load the Messenger route entry dynamically from app.",
  "users-direction": "The users module cannot depend on applications.",
  "users-public-entry": "Consume the users module through its public entries.",
  "platform-direction":
    "Platform dependencies stay within platform and shared, and shared stays independent of platform.",
  "shared-public-entry": "Use the shared module index from outside and concrete files from inside.",
  "static-value-cycle": "Static value imports and re-exports must be acyclic.",
};

function isProductionSource(file) {
  return (
    /\.tsx?$/.test(file) &&
    !/\.(?:d|test|spec|stories)\.tsx?$|^(?:test|__tests__)\/|\/__tests__\//.test(file)
  );
}

// With verbatimModuleSyntax, inline type specifiers can leave a runtime import {} or export {}.
// Only statement-level import type and export type erase the dependency.
function isStaticValue(node) {
  return !(node.importClause?.isTypeOnly || node.isTypeOnly);
}

// The same resolved edge can participate in a boundary check and in the static runtime graph.
function readModuleReferences(source) {
  const references = [];

  function add(specifier, kind) {
    if (specifier != null && ts.isStringLiteralLike(specifier))
      references.push({ specifier, kind });
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      add(node.moduleSpecifier, isStaticValue(node) ? "static-value" : "type");
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      add(node.arguments[0], "dynamic");
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      add(node.argument.literal, "type");
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      add(node.moduleReference.expression, node.isTypeOnly ? "type" : "static-value");
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return references;
}

// Recognize established shared module indexes without assuming other directories have public APIs.
function violatesSharedPublicEntry(from, to, files) {
  const moduleDirectory = /^shared\/(?:ui|lib)\/[^/]+\//.exec(to)?.[0];
  if (moduleDirectory == null) return false;
  const index = moduleDirectory + "index.ts";
  if (!files.has(index)) return false;
  const internal = from.startsWith(moduleDirectory);
  return internal ? to === index : to !== index;
}

// Users boundaries also apply when production code imports an excluded source or declaration.
function usersBoundaryRule(from, to) {
  if (from.startsWith(users)) {
    return to.startsWith("applications/") ? "users-direction" : null;
  }
  if (to.startsWith(users) && !usersPublicEntries.has(to.slice(users.length))) {
    return "users-public-entry";
  }
  return null;
}

// Platform can use shared primitives, and shared consumers receive platform operations from callers.
function violatesPlatformDirection(from, to) {
  const toPlatform = to.startsWith(platform);
  if (from.startsWith(platform)) return !toPlatform && !to.startsWith("shared/");
  return from.startsWith("shared/") && toPlatform;
}

function boundaryRules(from, to, kind, files) {
  const fromLayer = from.split("/", 1)[0];
  const toLayer = to.split("/", 1)[0];
  const fromRank = legacyLayers.indexOf(fromLayer);
  const violations = [];
  if (fromRank !== -1 && fromRank < legacyLayers.indexOf(toLayer)) {
    violations.push("legacy-direction");
  }
  if (
    ((fromLayer === "shared" || fromLayer === "entities") && toLayer === "applications") ||
    (fromLayer === "applications" && toLayer === "app")
  ) {
    violations.push("application-direction");
  }

  if (from.startsWith(messenger) && to.startsWith(messenger)) {
    const fromRole = from.slice(messenger.length).split("/", 1)[0];
    const toRole = to.slice(messenger.length).split("/", 1)[0];
    const allowed = messengerDirections[fromRole];
    if (
      allowed &&
      Object.hasOwn(messengerDirections, toRole) &&
      fromRole !== toRole &&
      !allowed.includes(toRole)
    ) {
      violations.push("messenger-direction");
    }
  }
  if (
    privateFiles.some(([owner, suffix]) => {
      const target = owner + suffix;
      return (
        !from.startsWith(owner) && (suffix.endsWith("/") ? to.startsWith(target) : to === target)
      );
    })
  ) {
    violations.push("messenger-private");
  }
  if (to === messenger + "messenger.ts" && (fromLayer !== "app" || kind !== "dynamic")) {
    violations.push("messenger-lazy-entry");
  }
  if (violatesSharedPublicEntry(from, to, files)) violations.push("shared-public-entry");
  return violations;
}

// Tarjan labels each strongly connected component so every existing cyclic edge can be tracked.
function findComponents(graph) {
  const ids = new Map();
  const lowLinks = new Map();
  const components = new Map();
  const stack = [];
  const onStack = new Set();

  function visit(file) {
    const id = ids.size;
    ids.set(file, id);
    lowLinks.set(file, id);
    stack.push(file);
    onStack.add(file);

    for (const target of graph.get(file).keys()) {
      if (!ids.has(target)) {
        visit(target);
        lowLinks.set(file, Math.min(lowLinks.get(file), lowLinks.get(target)));
      } else if (onStack.has(target)) {
        lowLinks.set(file, Math.min(lowLinks.get(file), ids.get(target)));
      }
    }

    if (lowLinks.get(file) === id) {
      let member;
      do {
        member = stack.pop();
        onStack.delete(member);
        components.set(member, id);
      } while (member !== file);
    }
  }

  for (const file of graph.keys()) {
    if (!ids.has(file)) visit(file);
  }
  return components;
}

function edgeKey({ from, to }) {
  return `${from} -> ${to}`;
}

function violationKey(violation) {
  return `${violation.rule}: ${edgeKey(violation)}`;
}

// Load production sources using the web project's real aliases and TypeScript module resolution.
export function collectArchitectureViolations(configPath) {
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error)
    throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
  const directory = dirname(configPath);
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    directory,
    undefined,
    configPath,
  );
  if (parsed.errors.length) {
    throw new Error(
      parsed.errors
        .map(({ messageText }) => ts.flattenDiagnosticMessageText(messageText, "\n"))
        .join("\n"),
    );
  }

  const sourceRoot = resolve(directory, "src");
  const canonicalSourceRoot = ts.sys.realpath(sourceRoot);
  const lowercaseSourceRoot = sourceRoot.toLowerCase();
  const files = new Map();
  for (const path of parsed.fileNames) {
    const file = relative(sourceRoot, path).split(sep).join("/");
    if (!file.startsWith("../") && isProductionSource(file)) files.set(path, file);
  }
  const cache = ts.createModuleResolutionCache(
    directory,
    (path) => (ts.sys.useCaseSensitiveFileNames ? path : path.toLowerCase()),
    parsed.options,
  );
  const graph = new Map(Array.from(files.values(), (file) => [file, new Map()]));
  const violations = new Map();
  function record(rule, edge) {
    const violation = { rule, ...edge };
    const key = violationKey(violation);
    if (!violations.has(key)) violations.set(key, violation);
  }

  for (const [path, from] of files) {
    const source = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      false,
    );
    for (const { specifier, kind } of readModuleReferences(source)) {
      const { resolvedModule } = ts.resolveModuleName(
        specifier.text,
        path,
        parsed.options,
        ts.sys,
        cache,
      );
      const targetPath = resolvedModule?.resolvedFileName;
      if (targetPath == null) continue;
      const productionTarget = files.get(targetPath);
      let to = productionTarget;
      // Check users and platform boundaries even for declarations and mixed-case paths.
      if (to == null) {
        const candidate = relative(lowercaseSourceRoot, targetPath.toLowerCase())
          .split(sep)
          .join("/");
        if (candidate.startsWith("../") || isAbsolute(candidate)) continue;
        if (
          !from.startsWith(platform) &&
          !/^(?:modules\/users|applications|platform)\//.test(candidate)
        ) {
          continue;
        }
        to = relative(canonicalSourceRoot, ts.sys.realpath(targetPath)).split(sep).join("/");
        if (to.startsWith("../") || isAbsolute(to)) continue;
      }
      const usersRule = usersBoundaryRule(from, to);
      const violatesPlatform = violatesPlatformDirection(from, to);
      if (productionTarget == null && usersRule == null && !violatesPlatform) continue;

      const edge = {
        from,
        to,
        line: source.getLineAndCharacterOfPosition(specifier.getStart(source)).line + 1,
      };
      if (usersRule != null) record(usersRule, edge);
      if (violatesPlatform) record("platform-direction", edge);
      if (productionTarget == null) continue;
      for (const rule of boundaryRules(from, to, kind, graph)) record(rule, edge);
      if (kind === "static-value" && !graph.get(from).has(to)) graph.get(from).set(to, edge);
    }
  }

  const components = findComponents(graph);
  for (const [from, edges] of graph) {
    for (const [to, edge] of edges) {
      if (components.get(from) === components.get(to)) record("static-value-cycle", edge);
    }
  }

  return {
    checked: files.size,
    violations: [...violations.values()].sort((a, b) =>
      violationKey(a).localeCompare(violationKey(b), "en"),
    ),
  };
}

// Match known violations by rule and directed file pair so exceptions cannot cover new edges.
export function compareArchitectureBaseline(violations, baseline) {
  const known = new Set();
  for (const [rule, edges] of Object.entries(baseline)) {
    if (!Object.hasOwn(rules, rule) || !Array.isArray(edges))
      throw new Error(`Invalid baseline rule: ${rule}`);
    for (const edge of edges) {
      if (typeof edge !== "string" || !/^\S+ -> \S+$/.test(edge))
        throw new Error(`Invalid baseline edge for ${rule}: ${edge}`);
      const key = `${rule}: ${edge}`;
      if (known.has(key)) throw new Error(`Duplicate baseline entry: ${key}`);
      known.add(key);
    }
  }
  const unexpected = violations.filter((violation) => !known.delete(violationKey(violation)));
  return { unexpected, obsolete: [...known] };
}

function main() {
  const { checked, violations } = collectArchitectureViolations(webConfig);
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  const { unexpected, obsolete } = compareArchitectureBaseline(violations, baseline);

  for (const { rule, from, to, line } of unexpected) {
    console.error(
      `packages/web/src/${from}:${line}: [${rule}] ${rules[rule]} -> packages/web/src/${to}`,
    );
  }
  for (const key of obsolete) console.error(`Remove obsolete architecture baseline entry: ${key}`);
  if (unexpected.length || obsolete.length) {
    process.exitCode = 1;
    return;
  }
  console.log(
    `Architecture check passed for ${checked} source files (${violations.length} existing exceptions).`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) main();
