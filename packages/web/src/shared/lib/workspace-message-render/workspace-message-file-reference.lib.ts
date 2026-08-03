import type { WorkspaceMessageFileReference } from "./workspace-message-document.types";

const UUID_PATTERN_SOURCE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const POSITIVE_INTEGER_PATTERN = /^\d+$/;
const WORKSPACE_FILE_URN_PATTERN = new RegExp(
  `^urn:(image|video|file):(${UUID_PATTERN_SOURCE})(?:\\?([\\s\\S]*))?$`,
  "i",
);
const WHITESPACE_PATTERN = /\s+/g;

type ParsedWorkspaceFileType = "image" | "video" | "file";

interface ParsedWorkspaceFileUrn {
  type: ParsedWorkspaceFileType;
  fileUuid: string;
  searchParams: URLSearchParams;
  href: string;
}

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  const normalized = value?.replace(WHITESPACE_PATTERN, " ").trim();
  return normalized == null || normalized.length === 0 ? undefined : normalized;
}

function parsePositiveIntegerParam(searchParams: URLSearchParams, key: string): number | undefined {
  const rawValue = normalizeOptionalText(searchParams.get(key));
  if (rawValue == null || !POSITIVE_INTEGER_PATTERN.test(rawValue)) {
    return undefined;
  }

  const parsed = Number(rawValue);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseWorkspaceFileUrn(href: string): ParsedWorkspaceFileUrn | null {
  const trimmed = href.trim();
  const match = WORKSPACE_FILE_URN_PATTERN.exec(trimmed);
  if (match == null) {
    return null;
  }

  const type = match[1]?.toLowerCase();
  if (type !== "image" && type !== "video" && type !== "file") {
    return null;
  }
  const fileUuid = match[2];
  if (fileUuid == null) {
    return null;
  }

  return {
    type,
    fileUuid,
    searchParams: new URLSearchParams(match[3] ?? ""),
    href: trimmed,
  };
}

export function parseWorkspaceMessageFileHref(
  href: string,
  label: string,
): WorkspaceMessageFileReference | null {
  const parsed = parseWorkspaceFileUrn(href);
  if (parsed == null) {
    return null;
  }

  const labelName = normalizeOptionalText(label);
  const queryName = normalizeOptionalText(parsed.searchParams.get("name"));
  const name = queryName ?? labelName;
  const contentType = normalizeOptionalText(parsed.searchParams.get("content_type"));
  const width = parsePositiveIntegerParam(parsed.searchParams, "w");
  const height = parsePositiveIntegerParam(parsed.searchParams, "h");
  const sizeBytes = parsePositiveIntegerParam(parsed.searchParams, "size");
  const mediaKind = parsed.type === "image" || parsed.type === "video" ? parsed.type : undefined;
  const kind = mediaKind == null ? "attachment" : "media";

  return {
    kind,
    href: parsed.href,
    fileUuid: parsed.fileUuid,
    ...(name == null ? {} : { name }),
    ...(contentType == null ? {} : { contentType }),
    ...(width == null ? {} : { width }),
    ...(height == null ? {} : { height }),
    ...(sizeBytes == null ? {} : { sizeBytes }),
    ...(mediaKind == null ? {} : { mediaKind }),
  };
}
