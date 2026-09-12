const WORKSPACE_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WORKSPACE_UUID_PATTERN_SOURCE =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const WORKSPACE_REFERENCE_URN_PATTERN = new RegExp(
  `^urn:(user|message|stream):(${WORKSPACE_UUID_PATTERN_SOURCE})$`,
  "i",
);
const WORKSPACE_TOPIC_URN_PATTERN = new RegExp(
  `^urn:topic:(${WORKSPACE_UUID_PATTERN_SOURCE})(?::(${WORKSPACE_UUID_PATTERN_SOURCE}))?$`,
  "i",
);
const WORKSPACE_QUOTE_URN_PATTERN = new RegExp(
  `^urn:quote:(${WORKSPACE_UUID_PATTERN_SOURCE})(?:\\?(.*))?$`,
  "i",
);
const WORKSPACE_FORWARD_URN_PATTERN = new RegExp(
  `^urn:forward:(${WORKSPACE_UUID_PATTERN_SOURCE})\\?(.*)$`,
  "i",
);
const WORKSPACE_URL_URN_PREFIX = "urn:url:";

export type WorkspaceTopicUrnReference =
  | { kind: "topic"; streamUuid: string; topicUuid: string }
  | { kind: "topic"; topicUuid: string; streamUuid?: never };

export interface WorkspaceQuoteUrnReference {
  kind: "quote";
  messageUuid: string;
  text?: string;
}

export interface WorkspaceForwardUrnReference {
  kind: "forward";
  messageUuid: string;
  snapshotMarkdown: string;
  snapshotFormat?: "plain";
  sourceLabel?: string;
  sourceKind?: "direct";
  sourceCreatedAt?: string;
}

export type WorkspaceUrnReference =
  | { kind: "user"; userUuid: string }
  | { kind: "message"; messageUuid: string }
  | { kind: "stream"; streamUuid: string }
  | WorkspaceQuoteUrnReference
  | WorkspaceForwardUrnReference
  | WorkspaceTopicUrnReference;

export function isWorkspaceUuid(value: unknown): value is string {
  return typeof value === "string" && WORKSPACE_UUID_PATTERN.test(value);
}

function normalizeWorkspaceUuid(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalizedValue = value.trim();
  return isWorkspaceUuid(normalizedValue) ? normalizedValue : null;
}

function buildUuidUrn(kind: "user" | "message" | "stream", uuid: unknown): string | null {
  const normalizedUuid = normalizeWorkspaceUuid(uuid);
  return normalizedUuid == null ? null : `urn:${kind}:${normalizedUuid}`;
}

function encodeWorkspaceQuoteText(text: string): string {
  return encodeURIComponent(text).replace(/[!'()*]/g, (character) => {
    return `%${character.charCodeAt(0).toString(16).toUpperCase()}`;
  });
}

function encodeBase64UrlUtf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decodeBase64UrlUtf8(value: string): string | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value) || value.length % 4 === 1) {
    return null;
  }
  const standard = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = standard.padEnd(standard.length + ((4 - (standard.length % 4)) % 4), "=");
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return encodeBase64UrlUtf8(decoded) === value ? decoded : null;
  } catch {
    return null;
  }
}

export function buildWorkspaceUserUrn(userUuid: unknown): string | null {
  return buildUuidUrn("user", userUuid);
}

export function buildWorkspaceMessageUrn(messageUuid: unknown): string | null {
  return buildUuidUrn("message", messageUuid);
}

export function buildWorkspaceQuoteUrn(messageUuid: unknown, text?: string): string | null {
  const normalizedMessageUuid = normalizeWorkspaceUuid(messageUuid);
  if (normalizedMessageUuid == null) {
    return null;
  }
  if (text == null || text.length === 0) {
    return `urn:quote:${normalizedMessageUuid}`;
  }
  return `urn:quote:${normalizedMessageUuid}?text=${encodeWorkspaceQuoteText(text)}`;
}

export function buildWorkspaceForwardUrn(
  messageUuid: unknown,
  snapshotMarkdown: string,
  options?: {
    snapshotFormat?: "plain";
    sourceLabel?: string;
    sourceKind?: "direct";
    sourceCreatedAt?: string;
  },
): string | null {
  const normalizedMessageUuid = normalizeWorkspaceUuid(messageUuid);
  if (normalizedMessageUuid == null) {
    return null;
  }
  const parts = [`snapshot=${encodeBase64UrlUtf8(snapshotMarkdown)}`];
  if (options?.snapshotFormat != null) {
    parts.push(`format=${options.snapshotFormat}`);
  }
  if (options?.sourceKind != null && options.sourceLabel == null) {
    return null;
  }
  if (options?.sourceLabel == null && options?.sourceCreatedAt == null) {
    return `urn:forward:${normalizedMessageUuid}?${parts.join("&")}`;
  }
  if (options?.sourceLabel == null || options.sourceCreatedAt == null) {
    return null;
  }
  const sourceLabel = options.sourceLabel.trim();
  const sourceCreatedAt = options.sourceCreatedAt.trim();
  if (
    sourceLabel.length === 0 ||
    sourceLabel.length > 512 ||
    sourceCreatedAt.length === 0 ||
    !Number.isFinite(Date.parse(sourceCreatedAt))
  ) {
    return null;
  }
  parts.push(`source=${encodeBase64UrlUtf8(sourceLabel)}`);
  if (options.sourceKind === "direct") {
    parts.push("source_kind=direct");
  }
  parts.push(`created_at=${encodeURIComponent(sourceCreatedAt)}`);
  return `urn:forward:${normalizedMessageUuid}?${parts.join("&")}`;
}

export function buildWorkspaceStreamUrn(streamUuid: unknown): string | null {
  return buildUuidUrn("stream", streamUuid);
}

export function buildWorkspaceTopicUrn(topicUuid: unknown): string | null {
  const normalizedTopicUuid = normalizeWorkspaceUuid(topicUuid);
  return normalizedTopicUuid == null ? null : `urn:topic:${normalizedTopicUuid}`;
}

export function buildWorkspaceReferenceUrn(
  reference: WorkspaceUrnReference | null | undefined,
): string | null {
  if (reference == null) {
    return null;
  }

  switch (reference.kind) {
    case "user":
      return buildWorkspaceUserUrn(reference.userUuid);
    case "message":
      return buildWorkspaceMessageUrn(reference.messageUuid);
    case "quote":
      return buildWorkspaceQuoteUrn(reference.messageUuid, reference.text);
    case "forward":
      return buildWorkspaceForwardUrn(reference.messageUuid, reference.snapshotMarkdown, {
        ...(reference.snapshotFormat != null ? { snapshotFormat: reference.snapshotFormat } : {}),
        ...(reference.sourceLabel != null && reference.sourceCreatedAt != null
          ? {
              sourceLabel: reference.sourceLabel,
              ...(reference.sourceKind != null ? { sourceKind: reference.sourceKind } : {}),
              sourceCreatedAt: reference.sourceCreatedAt,
            }
          : {}),
      });
    case "stream":
      return buildWorkspaceStreamUrn(reference.streamUuid);
    case "topic":
      return buildWorkspaceTopicUrn(reference.topicUuid);
    default:
      return null;
  }
}

function parseWorkspaceForwardUrn(value: string): WorkspaceForwardUrnReference | null {
  const forwardMatch = WORKSPACE_FORWARD_URN_PATTERN.exec(value);
  if (forwardMatch == null) {
    return null;
  }
  const messageUuid = forwardMatch[1];
  const rawQuery = forwardMatch[2];
  if (messageUuid == null || rawQuery == null || !isWorkspaceUuid(messageUuid)) {
    return null;
  }
  const parts = rawQuery.split("&");
  const values = new Map<string, string>();
  for (const part of parts) {
    const separator = part.indexOf("=");
    if (separator < 1) return null;
    const key = part.slice(0, separator);
    const value = part.slice(separator + 1);
    if (
      !new Set(["snapshot", "format", "source", "source_kind", "created_at"]).has(key) ||
      values.has(key)
    ) {
      return null;
    }
    values.set(key, value);
  }
  const encodedSnapshot = values.get("snapshot");
  if (encodedSnapshot == null) return null;
  const snapshotMarkdown = decodeBase64UrlUtf8(encodedSnapshot);
  if (snapshotMarkdown == null) return null;
  const snapshotFormat = values.get("format");
  if (snapshotFormat != null && snapshotFormat !== "plain") return null;
  const encodedSourceLabel = values.get("source");
  const sourceKind = values.get("source_kind");
  const encodedCreatedAt = values.get("created_at");
  if ((encodedSourceLabel == null) !== (encodedCreatedAt == null)) return null;
  if (sourceKind != null && (sourceKind !== "direct" || encodedSourceLabel == null)) return null;
  if (encodedSourceLabel == null || encodedCreatedAt == null) {
    return {
      kind: "forward",
      messageUuid,
      snapshotMarkdown,
      ...(snapshotFormat === "plain" ? { snapshotFormat } : {}),
    };
  }
  const sourceLabel = decodeBase64UrlUtf8(encodedSourceLabel)?.trim();
  let sourceCreatedAt: string;
  try {
    sourceCreatedAt = decodeURIComponent(encodedCreatedAt).trim();
  } catch {
    return null;
  }
  if (
    sourceLabel == null ||
    sourceLabel.length === 0 ||
    sourceLabel.length > 512 ||
    sourceCreatedAt.length === 0 ||
    !Number.isFinite(Date.parse(sourceCreatedAt))
  ) {
    return null;
  }
  return {
    kind: "forward",
    messageUuid,
    snapshotMarkdown,
    ...(snapshotFormat === "plain" ? { snapshotFormat } : {}),
    sourceLabel,
    ...(sourceKind === "direct" ? { sourceKind } : {}),
    sourceCreatedAt,
  };
}

function parseWorkspaceQuoteUrn(value: string): WorkspaceQuoteUrnReference | null {
  const quoteMatch = WORKSPACE_QUOTE_URN_PATTERN.exec(value);
  if (quoteMatch == null) {
    return null;
  }

  const messageUuid = quoteMatch[1];
  const query = quoteMatch[2];
  if (messageUuid == null || !isWorkspaceUuid(messageUuid)) {
    return null;
  }
  if (query == null) {
    return { kind: "quote", messageUuid };
  }

  const queryParts = query.split("&");
  const textPrefix = "text=";
  const textPart = queryParts[0];
  if (queryParts.length !== 1 || textPart?.startsWith(textPrefix) !== true) {
    return null;
  }

  try {
    const text = decodeURIComponent(textPart.slice(textPrefix.length));
    return text.length === 0
      ? { kind: "quote", messageUuid }
      : { kind: "quote", messageUuid, text };
  } catch {
    return null;
  }
}

export function parseWorkspaceReferenceUrn(value: unknown): WorkspaceUrnReference | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  const forwardReference = parseWorkspaceForwardUrn(normalizedValue);
  if (forwardReference != null) {
    return forwardReference;
  }
  const quoteReference = parseWorkspaceQuoteUrn(normalizedValue);
  if (quoteReference != null) {
    return quoteReference;
  }

  const topicMatch = WORKSPACE_TOPIC_URN_PATTERN.exec(normalizedValue);
  if (topicMatch != null) {
    const firstUuid = topicMatch[1];
    const secondUuid = topicMatch[2];
    if (firstUuid == null) {
      return null;
    }
    return secondUuid == null
      ? { kind: "topic", topicUuid: firstUuid }
      : { kind: "topic", streamUuid: firstUuid, topicUuid: secondUuid };
  }

  const referenceMatch = WORKSPACE_REFERENCE_URN_PATTERN.exec(normalizedValue);
  if (referenceMatch == null) {
    return null;
  }

  const kind = referenceMatch[1];
  const uuid = referenceMatch[2];
  if (kind == null || uuid == null || !isWorkspaceUuid(uuid)) {
    return null;
  }

  switch (kind.toLowerCase()) {
    case "user":
      return { kind: "user", userUuid: uuid };
    case "message":
      return { kind: "message", messageUuid: uuid };
    case "stream":
      return { kind: "stream", streamUuid: uuid };
    default:
      return null;
  }
}

export function parseWorkspaceUrlUrn(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  if (
    normalizedValue.slice(0, WORKSPACE_URL_URN_PREFIX.length).toLowerCase() !==
    WORKSPACE_URL_URN_PREFIX
  ) {
    return null;
  }

  const urlValue = normalizedValue.slice(WORKSPACE_URL_URN_PREFIX.length);
  if (urlValue.length === 0 || /\s/.test(urlValue)) {
    return null;
  }

  try {
    const url = new URL(urlValue);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username.length > 0 ||
      url.password.length > 0
    ) {
      return null;
    }
  } catch {
    return null;
  }

  return urlValue;
}
