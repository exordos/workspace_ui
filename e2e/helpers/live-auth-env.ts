import { existsSync, readFileSync } from "node:fs";

export type LiveAuthEnv = Record<string, string>;

export function parseDotEnv(contents: string): LiveAuthEnv {
  const env: LiveAuthEnv = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (!key) continue;
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

export function loadLiveAuthEnvFromFile(): LiveAuthEnv {
  const envPath = `${process.cwd()}/packages/web/.env`;
  if (!existsSync(envPath)) return {};
  try {
    return parseDotEnv(readFileSync(envPath, "utf8"));
  } catch {
    return {};
  }
}

export function resolveLiveAuthVar(key: string, fileEnv: LiveAuthEnv): string | undefined {
  const processValue = process.env[key];
  const fileValue = fileEnv[key];
  if (!fileValue) return processValue;
  if (!processValue) return fileValue;

  if (fileValue.includes("$") && !processValue.includes("$") && fileValue.startsWith(processValue)) {
    return fileValue;
  }
  return processValue;
}

const FILE_ENV = loadLiveAuthEnvFromFile();

export const LIVE_REALM = resolveLiveAuthVar("TEST_USER_ZULIP_SERVER", FILE_ENV);
export const LIVE_EMAIL = resolveLiveAuthVar("TEST_USER_EMAIL", FILE_ENV);
export const LIVE_PASSWORD = resolveLiveAuthVar("TEST_USER_PASSWORD", FILE_ENV);

export function hasLiveAuthCredentials(): boolean {
  return Boolean(LIVE_REALM && LIVE_EMAIL && LIVE_PASSWORD);
}
