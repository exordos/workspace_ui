import type {
  WorkspaceMessageDocument,
  WorkspaceMessageFileReference,
} from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import { collectWorkspaceMarkdownFileReferences } from "~/shared/lib/workspace-message-render/workspace-message-marked.lib";

export function collectWorkspaceMessageFileReferences(
  document: WorkspaceMessageDocument,
): readonly WorkspaceMessageFileReference[] {
  return collectWorkspaceMarkdownFileReferences(document.markdownTokens);
}
