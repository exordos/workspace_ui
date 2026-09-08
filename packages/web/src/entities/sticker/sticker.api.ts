import { isWorkspaceUuid } from "~/shared/lib/workspace-reference-urn.lib";
import type { Sticker, StickerReference } from "./sticker.types";

const WORKSPACE_STICKER_URN_PATTERN = /^urn:sticker:([^:]+)$/i;
const STICKER_MARKDOWN_PATTERN = /^!\[sticker\]\((urn:sticker:[^)]+)\)$/i;

export function buildStickerUrn(stickerId: string): string {
  const normalizedStickerId = stickerId.trim();
  if (!isWorkspaceUuid(normalizedStickerId)) {
    throw new TypeError("Sticker ID must be a Workspace UUID");
  }
  return `urn:sticker:${normalizedStickerId.toLowerCase()}`;
}

export function buildStickerReferenceUrn(reference: StickerReference): string {
  return buildStickerUrn(reference.stickerId);
}

export function parseStickerUrn(value: unknown): StickerReference | null {
  if (typeof value !== "string") return null;
  const normalizedValue = value.trim();
  const workspaceMatch = WORKSPACE_STICKER_URN_PATTERN.exec(normalizedValue);
  const stickerId = workspaceMatch?.[1];
  if (isWorkspaceUuid(stickerId)) {
    return { kind: "workspace", stickerId: stickerId.toLowerCase() };
  }

  return null;
}

export function buildStickerMarkdown(sticker: Pick<Sticker, "reference">): string {
  return `![sticker](${buildStickerReferenceUrn(sticker.reference)})`;
}

export function parseStickerFromContent(content: string): StickerReference | null {
  const match = STICKER_MARKDOWN_PATTERN.exec(content.trim());
  const urn = match?.[1];
  return urn == null ? null : parseStickerUrn(urn);
}

export function isStickerMessage(content: string): boolean {
  return parseStickerFromContent(content) != null;
}

export function containsStickerMarkdown(content: string): boolean {
  return /!\[[^\]]*\]\(\s*urn:sticker:[^)]+\)/i.test(content);
}
