import { sanitizeFilename } from "~/shared/lib/validation";

const COMPOSER_UPLOAD_PLACEHOLDER_URL_PREFIX = "workspace-upload://";
const PLACEHOLDER_LINK_TEXT_PATTERN = "!?\\[[^\\]\\n]*\\]";

const placeholderIds = new WeakMap<File, string>();
let fallbackIdCounter = 0;

function createPlaceholderId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  fallbackIdCounter += 1;
  return `${Date.now().toString(36)}-${fallbackIdCounter.toString(36)}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeComposerFileName(file: File): string {
  return sanitizeFilename(file.name) || "file";
}

export function getComposerUploadPlaceholderUrl(file: File): string {
  const existing = placeholderIds.get(file);
  if (existing != null) {
    return `${COMPOSER_UPLOAD_PLACEHOLDER_URL_PREFIX}${existing}`;
  }
  const id = createPlaceholderId();
  placeholderIds.set(file, id);
  return `${COMPOSER_UPLOAD_PLACEHOLDER_URL_PREFIX}${id}`;
}

export function buildComposerUploadPlaceholder(file: File): string {
  return `[${safeComposerFileName(file)}](${getComposerUploadPlaceholderUrl(file)})`;
}

export function buildComposerUploadPlaceholders(files: readonly File[]): string {
  return files.map((file) => buildComposerUploadPlaceholder(file)).join("\n");
}

function appendUploadLinks(content: string, uploadedLinks: readonly string[]): string {
  const links = uploadedLinks.filter((link) => link.trim().length > 0);
  if (links.length === 0) return content;
  if (content.length === 0) return links.join("\n");
  const separator = content.endsWith("\n") ? "" : "\n";
  return `${content}${separator}${links.join("\n")}`;
}

function replaceFirstPlaceholderLink(
  content: string,
  placeholderUrl: string,
  uploadedLink: string,
): { content: string; replaced: boolean } {
  const pattern = new RegExp(
    `${PLACEHOLDER_LINK_TEXT_PATTERN}\\(${escapeRegExp(placeholderUrl)}\\)`,
  );
  let replaced = false;
  const nextContent = content.replace(pattern, () => {
    replaced = true;
    return uploadedLink;
  });
  return { content: nextContent, replaced };
}

export function replaceComposerUploadPlaceholders(
  content: string,
  files: readonly File[],
  uploadedLinks: readonly string[],
): string {
  let nextContent = content;
  const linksToAppend: string[] = [];

  for (let index = 0; index < uploadedLinks.length; index += 1) {
    const uploadedLink = uploadedLinks[index];
    if (uploadedLink == null || uploadedLink.trim().length === 0) continue;
    const file = files[index];
    if (file == null) {
      linksToAppend.push(uploadedLink);
      continue;
    }
    const result = replaceFirstPlaceholderLink(
      nextContent,
      getComposerUploadPlaceholderUrl(file),
      uploadedLink,
    );
    nextContent = result.content;
    if (!result.replaced) {
      linksToAppend.push(uploadedLink);
    }
  }

  return appendUploadLinks(nextContent, linksToAppend);
}

export function removeComposerUploadPlaceholder(content: string, file: File): string {
  const placeholderUrl = getComposerUploadPlaceholderUrl(file);
  const pattern = new RegExp(
    `(?:^|\\n)?${PLACEHOLDER_LINK_TEXT_PATTERN}\\(${escapeRegExp(placeholderUrl)}\\)(?:\\n|$)?`,
  );
  return content.replace(pattern, (match) => {
    const startsWithNewline = match.startsWith("\n");
    const endsWithNewline = match.endsWith("\n");
    return startsWithNewline && endsWithNewline ? "\n" : "";
  });
}
