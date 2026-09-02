import { isWorkspaceUuid } from "~/shared/lib/workspace-reference-urn.lib";
import type { Sticker, StickerReference } from "./sticker.types";

const GIPHY_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const WORKSPACE_STICKER_URN_PATTERN = /^urn:sticker:([^:]+)$/i;
const GIPHY_STICKER_URN_PATTERN = /^urn:sticker:giphy:([A-Za-z0-9_-]+)$/;
const STICKER_MARKDOWN_PATTERN = /^!\[sticker\]\((urn:sticker:[^)]+)\)$/i;

export function buildStickerUrn(stickerId: string): string {
  const normalizedStickerId = stickerId.trim();
  if (!isWorkspaceUuid(normalizedStickerId)) {
    throw new TypeError("Sticker ID must be a Workspace UUID");
  }
  return `urn:sticker:${normalizedStickerId.toLowerCase()}`;
}

export function buildStickerReferenceUrn(reference: StickerReference): string {
  if (reference.kind === "workspace") return buildStickerUrn(reference.stickerId);

  const externalId = reference.externalId.trim();
  if (reference.provider !== "giphy" || !GIPHY_ID_PATTERN.test(externalId)) {
    throw new TypeError("Sticker provider reference is invalid");
  }
  return `urn:sticker:giphy:${externalId}`;
}

export function parseStickerUrn(value: unknown): StickerReference | null {
  if (typeof value !== "string") return null;
  const normalizedValue = value.trim();
  const workspaceMatch = WORKSPACE_STICKER_URN_PATTERN.exec(normalizedValue);
  const stickerId = workspaceMatch?.[1];
  if (isWorkspaceUuid(stickerId)) {
    return { kind: "workspace", stickerId: stickerId.toLowerCase() };
  }

  const providerMatch = GIPHY_STICKER_URN_PATTERN.exec(normalizedValue);
  const externalId = providerMatch?.[1];
  return externalId == null ? null : { kind: "provider", provider: "giphy", externalId };
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
