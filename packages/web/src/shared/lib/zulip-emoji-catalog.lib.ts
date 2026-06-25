import type { ReactionType } from "~/shared/api/zulip.types";
import { isAbortError } from "~/shared/lib/abort-error";
import { createLogger } from "~/shared/lib/logger";

const log = createLogger("zulip-emoji-catalog");

export type ZulipEmojiCatalogLoadStatus = "idle" | "loading" | "ready" | "failed";

export interface ZulipUnicodeEmojiCatalogEntry {
  emojiName: string;
  emojiCode: string;
  reactionType: Extract<ReactionType, "unicode_emoji">;
}

interface ZulipServerEmojiData {
  code_to_names?: Record<string, readonly string[]>;
}

interface ZulipEmojiCatalogState {
  serverEmojiDataUrl: string | null;
  realmRoot: string | null;
  status: ZulipEmojiCatalogLoadStatus;
  byCode: Map<string, ZulipUnicodeEmojiCatalogEntry>;
  loadedAt: string | null;
}

const EMPTY_STATE: ZulipEmojiCatalogState = {
  serverEmojiDataUrl: null,
  realmRoot: null,
  status: "idle",
  byCode: new Map(),
  loadedAt: null,
};

let catalogState: ZulipEmojiCatalogState = EMPTY_STATE;
let inFlightRequest: Promise<void> | null = null;
let requestGeneration = 0;
let activeFetchController: AbortController | null = null;

function normalizeEmojiCode(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .split("-")
    .filter((part) => part.length > 0)
    .join("-");
}

function stripEmojiVariationSelector(code: string): string {
  return normalizeEmojiCode(code)
    .split("-")
    .filter((part) => part !== "fe0f")
    .join("-");
}

function toCodeAliases(code: string): string[] {
  const normalized = normalizeEmojiCode(code);
  if (normalized.length === 0) {
    return [];
  }
  const withoutVariation = stripEmojiVariationSelector(normalized);
  return Array.from(
    new Set([normalized, withoutVariation].filter((candidate) => candidate.length > 0)),
  );
}

function parseServerEmojiData(value: unknown): ZulipServerEmojiData {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const rawCodeToNames = (value as Record<string, unknown>).code_to_names;
  if (
    rawCodeToNames == null ||
    typeof rawCodeToNames !== "object" ||
    Array.isArray(rawCodeToNames)
  ) {
    return {};
  }
  const codeToNames: Record<string, readonly string[]> = {};
  for (const [code, namesRaw] of Object.entries(rawCodeToNames)) {
    if (!Array.isArray(namesRaw)) {
      continue;
    }
    const names = namesRaw
      .filter((name): name is string => typeof name === "string")
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
    if (names.length === 0) {
      continue;
    }
    codeToNames[code] = names;
  }
  return { code_to_names: codeToNames };
}

function buildByCode(data: ZulipServerEmojiData): Map<string, ZulipUnicodeEmojiCatalogEntry> {
  const byCode = new Map<string, ZulipUnicodeEmojiCatalogEntry>();
  for (const [rawCode, names] of Object.entries(data.code_to_names ?? {})) {
    const emojiCode = normalizeEmojiCode(rawCode);
    const emojiName = names[0]?.trim();
    if (emojiCode.length === 0 || emojiName == null || emojiName.length === 0) {
      continue;
    }
    const entry: ZulipUnicodeEmojiCatalogEntry = {
      emojiName,
      emojiCode,
      reactionType: "unicode_emoji",
    };
    for (const alias of toCodeAliases(emojiCode)) {
      byCode.set(alias, entry);
    }
  }
  return byCode;
}

function normalizeConfigValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function resolveEmojiDataRequestTarget(
  serverEmojiDataUrl: string,
  realmRoot: string | null,
): string | null {
  try {
    const parsed = realmRoot ? new URL(serverEmojiDataUrl, realmRoot) : new URL(serverEmojiDataUrl);
    return parsed.toString();
  } catch {
    return null;
  }
}

function isCurrentRequest(options: {
  generation: number;
  serverEmojiDataUrl: string;
  realmRoot: string | null;
  controller: AbortController;
}): boolean {
  return (
    options.generation === requestGeneration &&
    activeFetchController === options.controller &&
    catalogState.serverEmojiDataUrl === options.serverEmojiDataUrl &&
    catalogState.realmRoot === options.realmRoot
  );
}

export function configureZulipEmojiCatalog(
  serverEmojiDataUrl: string | null | undefined,
  realmRoot: string | null | undefined,
): void {
  const nextServerEmojiDataUrl = normalizeConfigValue(serverEmojiDataUrl);
  const nextRealmRoot = normalizeConfigValue(realmRoot);

  if (
    catalogState.serverEmojiDataUrl === nextServerEmojiDataUrl &&
    catalogState.realmRoot === nextRealmRoot
  ) {
    return;
  }

  requestGeneration += 1;
  activeFetchController?.abort();
  activeFetchController = null;
  inFlightRequest = null;
  catalogState = {
    serverEmojiDataUrl: nextServerEmojiDataUrl,
    realmRoot: nextRealmRoot,
    status: nextServerEmojiDataUrl ? "idle" : "failed",
    byCode: new Map(),
    loadedAt: null,
  };
}

export function getZulipEmojiCatalogStatus(): ZulipEmojiCatalogLoadStatus {
  return catalogState.status;
}

export function ensureZulipEmojiCatalogLoaded(): Promise<void> {
  if (catalogState.status === "ready") {
    return Promise.resolve();
  }
  if (inFlightRequest != null) {
    return inFlightRequest;
  }
  const serverEmojiDataUrl = catalogState.serverEmojiDataUrl;
  const realmRoot = catalogState.realmRoot;
  if (serverEmojiDataUrl == null) {
    catalogState = { ...catalogState, status: "failed" };
    return Promise.resolve();
  }
  const requestTarget = resolveEmojiDataRequestTarget(serverEmojiDataUrl, realmRoot);
  if (requestTarget == null) {
    catalogState = { ...catalogState, status: "failed" };
    return Promise.resolve();
  }

  const generation = requestGeneration;
  const controller = new AbortController();
  activeFetchController = controller;
  catalogState = { ...catalogState, status: "loading" };
  inFlightRequest = fetch(requestTarget, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    credentials: "omit",
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`HTTP_${response.status}`);
      }
      const data = parseServerEmojiData(await response.json());
      if (!isCurrentRequest({ generation, serverEmojiDataUrl, realmRoot, controller })) {
        return;
      }
      catalogState = {
        ...catalogState,
        status: "ready",
        byCode: buildByCode(data),
        loadedAt: new Date().toISOString(),
      };
    })
    .catch((error: unknown) => {
      if (
        isAbortError(error) ||
        !isCurrentRequest({ generation, serverEmojiDataUrl, realmRoot, controller })
      ) {
        return;
      }
      catalogState = { ...catalogState, status: "failed", byCode: new Map(), loadedAt: null };
      log.warn("Failed to load Zulip server emoji catalog", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    })
    .finally(() => {
      if (isCurrentRequest({ generation, serverEmojiDataUrl, realmRoot, controller })) {
        inFlightRequest = null;
        activeFetchController = null;
      }
    });

  return inFlightRequest;
}

export function resolveZulipUnicodeEmojiFromCatalog(
  emojiCodes: readonly string[],
): ZulipUnicodeEmojiCatalogEntry | null {
  for (const code of emojiCodes) {
    for (const alias of toCodeAliases(code)) {
      const entry = catalogState.byCode.get(alias);
      if (entry != null) {
        return entry;
      }
    }
  }
  return null;
}

export function resetZulipEmojiCatalogForTests(): void {
  requestGeneration += 1;
  activeFetchController?.abort();
  activeFetchController = null;
  inFlightRequest = null;
  catalogState = EMPTY_STATE;
}

export function setZulipEmojiCatalogForTests(data: ZulipServerEmojiData): void {
  requestGeneration += 1;
  activeFetchController?.abort();
  activeFetchController = null;
  inFlightRequest = null;
  catalogState = {
    serverEmojiDataUrl: "https://zulip.test/static/generated/emoji/emoji.json",
    realmRoot: "https://zulip.test",
    status: "ready",
    byCode: buildByCode(data),
    loadedAt: new Date().toISOString(),
  };
}
