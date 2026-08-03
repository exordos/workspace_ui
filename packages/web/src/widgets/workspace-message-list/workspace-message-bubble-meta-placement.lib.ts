export type WorkspaceMessageBubbleMetaPlacement = "inline" | "row";

interface ResolveWorkspaceBubbleMetaPlacementOptions {
  text: string;
  attachmentsCount?: number;
  hasReactions?: boolean;
  hasLinkPreview?: boolean;
  hasRichBlocks?: boolean;
}

/**
 * Widget-level mirror of parse metadata placement rules.
 * Prefer `metadata.preferredMetaPlacement` from the render pipeline when available.
 */
export function resolveWorkspaceBubbleMetaPlacement({
  text,
  attachmentsCount = 0,
  hasReactions = false,
  hasLinkPreview = false,
  hasRichBlocks = false,
}: ResolveWorkspaceBubbleMetaPlacementOptions): WorkspaceMessageBubbleMetaPlacement {
  if (attachmentsCount > 0 || hasReactions || hasLinkPreview || hasRichBlocks) {
    return "row";
  }

  return text.trim().length > 0 ? "inline" : "row";
}
