import { isIamUserUuid } from "./user-id.lib";

function escapeMarkdownLinkLabel(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("[", "\\[").replaceAll("]", "\\]");
}

/** Canonical Messenger v1 user mention stored in message markdown. */
export function buildWorkspaceUserMentionMarkdown(displayName: string, userUuid: string): string {
  const uuid = userUuid.trim().toLowerCase();
  if (!isIamUserUuid(uuid)) {
    throw new Error("Workspace user mention requires an IAM user UUID");
  }
  return `[${escapeMarkdownLinkLabel(displayName.trim())}](urn:user:${uuid})`;
}
