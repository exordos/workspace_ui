/**
 * Defers metadata-first stream preview apply until register unread reconcile is done.
 */
import { logChatListFlow } from "~/shared/lib/message-flow-debug.lib";
import type { ChatListBootstrapResult } from "./layout-chat-list-bootstrap.lib";

export type StreamPreviewsBootstrapResult = Extract<
  ChatListBootstrapResult,
  { mode: "streamPreviews" }
>;

export interface MetadataStreamPreviewCoordinator {
  stageStreamPreviews: (result: StreamPreviewsBootstrapResult) => void;
  markRegisterHydrationReady: () => void;
  flushStreamPreviews: (apply: (result: StreamPreviewsBootstrapResult) => void) => boolean;
  reset: () => void;
  hasPending: () => boolean;
}

export function createMetadataStreamPreviewCoordinator(): MetadataStreamPreviewCoordinator {
  let pending: StreamPreviewsBootstrapResult | null = null;
  let registerHydrationReady = false;

  return {
    stageStreamPreviews(result) {
      pending = result;
      logChatListFlow("metadataStreamPreview: staged (awaiting register unread)", {
        messageCount: result.messages.length,
        registerHydrationReady,
      });
    },

    markRegisterHydrationReady() {
      registerHydrationReady = true;
      logChatListFlow("metadataStreamPreview: register hydration ready", {
        hasPending: pending != null,
      });
    },

    flushStreamPreviews(apply) {
      if (!registerHydrationReady || pending == null) {
        return false;
      }
      const result = pending;
      pending = null;
      logChatListFlow("metadataStreamPreview: applying stream previews after register unread", {
        messageCount: result.messages.length,
      });
      apply(result);
      return true;
    },

    reset() {
      pending = null;
      registerHydrationReady = false;
    },

    hasPending() {
      return pending != null;
    },
  };
}
