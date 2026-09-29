import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function documents(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    // Archived proposals retain their original, potentially obsolete references.
    if (entry.isDirectory()) return entry.name === "archive" ? [] : documents(path);
    return entry.isFile() && [".md", ".mdc"].includes(extname(path)) ? [path] : [];
  });
}

const requested = process.argv.slice(2);
const files = requested.length
  ? requested.map((path) => resolve(root, path))
  : [
      ...readdirSync(root)
        .filter((name) => name.endsWith(".md"))
        .map((name) => join(root, name)),
      ...["docs", ".cursor", ".agents", ".github"].flatMap((name) => documents(join(root, name))),
    ];

const failures = [];
let checkedLinks = 0;
let checkedImports = 0;

function fail(file, text, offset, message) {
  const line = text.slice(0, offset).split("\n").length;
  failures.push(`${relative(root, file)}:${line}: ${message}`);
}

for (const file of files) {
  if (!existsSync(file) || !statSync(file).isFile()) {
    failures.push(`Not a file: ${relative(root, file)}`);
    continue;
  }
  const text = readFileSync(file, "utf8");
  // Keep offsets stable while excluding fenced examples from Markdown link parsing.
  let fence = null;
  const prose = text
    .split("\n")
    .map((line) => {
      const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
      const wasFenced = fence != null;
      if (marker && fence == null) fence = marker;
      else if (marker && marker[0] === fence?.[0] && marker.length >= fence.length) fence = null;
      return wasFenced || fence != null ? " ".repeat(line.length) : line;
    })
    .join("\n");

  const inline = /\[[^\]\n]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+"[^"]*")?\s*\)/g;
  const references = /^\s*\[[^\]\n]+\]:\s*(?:<([^>]+)>|(\S+))/gm;
  for (const match of [...prose.matchAll(inline), ...prose.matchAll(references)]) {
    const target = match[1] ?? match[2];
    if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(target)) continue;
    const path = target.split(/[?#]/, 1)[0];
    if (!path) continue;
    checkedLinks++;
    let decoded;
    try {
      decoded = decodeURIComponent(path);
    } catch {
      fail(file, text, match.index, `Invalid URL encoding: ${target}`);
      continue;
    }
    const resolved = isAbsolute(decoded)
      ? resolve(root, `.${decoded}`)
      : resolve(dirname(file), decoded);
    if (!existsSync(resolved)) fail(file, text, match.index, `Missing local link: ${target}`);
  }

  // ADR examples describe historical decisions, not current copy-paste imports.
  if (relative(root, file).startsWith(`docs${process.platform === "win32" ? "\\" : "/"}adr`))
    continue;
  for (const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)["'](~\/[^"']+)["']/g)) {
    const target = match[1];
    if (/[<>*{}]/.test(target)) continue;
    checkedImports++;
    const base = resolve(root, "packages/web/src", target.slice(2));
    const found = ["", ".ts", ".tsx", ".js", ".jsx", ".json", ".css"].some((suffix) => {
      const path = base + suffix;
      return existsSync(path) && statSync(path).isFile();
    });
    if (!found)
      fail(file, text, match.index, `Import must resolve to a concrete source file: ${target}`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Documentation OK: ${files.length} files, ${checkedLinks} local links, ${checkedImports} import paths.`,
  );
}
