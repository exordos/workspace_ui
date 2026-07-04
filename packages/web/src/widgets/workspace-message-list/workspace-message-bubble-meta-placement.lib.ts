export type WorkspaceMessageBubbleMetaPlacement = "inline" | "row";

interface ResolveWorkspaceBubbleMetaPlacementOptions {
  text: string;
  attachmentsCount?: number;
  hasReactions?: boolean;
  hasLinkPreview?: boolean;
}

const LONG_WORD_MIN_LENGTH = 32;
const LINE_BREAK_PATTERN = /\r|\n/;
const WHITESPACE_PATTERN = /\s+/;

function hasLongWord(value: string): boolean {
  return value.split(WHITESPACE_PATTERN).some((word) => word.length >= LONG_WORD_MIN_LENGTH);
}

function isSimplePlainText(value: string): boolean {
  const trimmed = value.trim();

  return trimmed.length > 0 && !LINE_BREAK_PATTERN.test(trimmed) && !hasLongWord(trimmed);
}

export function resolveWorkspaceBubbleMetaPlacement({
  text,
  attachmentsCount = 0,
  hasReactions = false,
  hasLinkPreview = false,
}: ResolveWorkspaceBubbleMetaPlacementOptions): WorkspaceMessageBubbleMetaPlacement {
  if (attachmentsCount > 0 || hasReactions || hasLinkPreview) {
    return "row";
  }

  return isSimplePlainText(text) ? "inline" : "row";
}
