/**
 * DM preview hydration traces — gated by runtime `trace:chat-list` (see pipeline-trace.lib).
 */
import {
  logChatListFlow,
  summarizeRecentPrivateConversationsForTrace,
} from "~/shared/lib/pipeline-trace.lib";

export function traceDmPreviewHydrate(phase: string, data?: Record<string, unknown>): void {
  logChatListFlow(`dmPreview:${phase}`, data ?? {});
}

export { summarizeRecentPrivateConversationsForTrace };
