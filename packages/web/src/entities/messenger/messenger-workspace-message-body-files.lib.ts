import type {
  WorkspaceMessageBlock,
  WorkspaceMessageDocument,
  WorkspaceMessageFileReference,
  WorkspaceMessageInline,
} from "~/shared/lib/workspace-message-render/workspace-message-document.types";

function collectFromInline(
  inline: WorkspaceMessageInline,
  references: WorkspaceMessageFileReference[],
): void {
  switch (inline.kind) {
    case "file":
      references.push(inline.reference);
      return;
    case "emphasis":
    case "strong":
    case "link":
    case "spoiler":
      for (const child of inline.children) {
        collectFromInline(child, references);
      }
      return;
    case "text":
    case "break":
    case "code":
    case "mention":
    case "emoji":
    case "unsupported-media":
      return;
  }
}

function collectFromBlock(
  block: WorkspaceMessageBlock,
  references: WorkspaceMessageFileReference[],
): void {
  switch (block.kind) {
    case "paragraph":
      for (const child of block.children) {
        collectFromInline(child, references);
      }
      return;
    case "quote":
      for (const childBlock of block.blocks) {
        collectFromBlock(childBlock, references);
      }
      return;
    case "list":
      for (const item of block.items) {
        for (const childBlock of item.blocks) {
          collectFromBlock(childBlock, references);
        }
      }
      return;
    case "code":
      return;
    case "spoiler":
      for (const headerChild of block.header) {
        collectFromInline(headerChild, references);
      }
      for (const childBlock of block.blocks) {
        collectFromBlock(childBlock, references);
      }
      return;
  }
}

export function collectWorkspaceMessageFileReferences(
  document: WorkspaceMessageDocument,
): readonly WorkspaceMessageFileReference[] {
  const references: WorkspaceMessageFileReference[] = [];
  for (const block of document.blocks) {
    collectFromBlock(block, references);
  }
  return references;
}
