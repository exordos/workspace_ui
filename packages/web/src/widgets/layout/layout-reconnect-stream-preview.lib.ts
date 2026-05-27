/**
 * Stages full-reconnect stream preview batches until register unread is reconciled (same ordering as cold start).
 */
import { logChatListFlow } from "~/shared/lib/message-flow-debug.lib";
import type { ApplyChatListBootstrapResultOptions } from "./layout-chat-list-bootstrap-apply.lib";
import type { StreamPreviewsBootstrapResult } from "./layout-metadata-stream-preview-coordinator.lib";

let pendingReconnect: StreamPreviewsBootstrapResult | null = null;
let pendingApplyOptions: ApplyChatListBootstrapResultOptions | null = null;
let registerHydrationReady = false;

export function resetReconnectStreamPreviewStaging(): void {
  pendingReconnect = null;
  pendingApplyOptions = null;
  registerHydrationReady = false;
}

export function stageReconnectStreamPreviews(
  result: StreamPreviewsBootstrapResult,
  applyOptions: ApplyChatListBootstrapResultOptions,
): void {
  pendingReconnect = result;
  pendingApplyOptions = applyOptions;
  logChatListFlow("reconnectStreamPreview: staged (awaiting register unread)", {
    messageCount: result.messages.length,
    registerHydrationReady,
  });
}

export function markReconnectStreamPreviewRegisterReady(): void {
  registerHydrationReady = true;
  logChatListFlow("reconnectStreamPreview: register hydration ready", {
    hasPending: pendingReconnect != null,
  });
}

/** Applies staged reconnect previews after register unread; returns true when a batch was applied. */
export function flushReconnectStreamPreviewsAfterRegister(
  apply: (
    result: StreamPreviewsBootstrapResult,
    options: ApplyChatListBootstrapResultOptions,
  ) => void,
): boolean {
  if (!registerHydrationReady || pendingReconnect == null || pendingApplyOptions == null) {
    return false;
  }
  const result = pendingReconnect;
  const options = pendingApplyOptions;
  pendingReconnect = null;
  pendingApplyOptions = null;
  logChatListFlow("reconnectStreamPreview: applying after register unread", {
    messageCount: result.messages.length,
  });
  apply(result, options);
  return true;
}

export function hasPendingReconnectStreamPreviews(): boolean {
  return pendingReconnect != null;
}
