/**
 * Outgoing message send, retry, and upload cancellation for the chat page.
 */
import { useCallback, useEffect, useRef } from "react";
import { t } from "~/i18n/i18n";
import type { MockMessage } from "~/shared/api/zulip.types";
import { executeChatPageSend } from "./chat-page-send-handler.lib";
import type { ComposerUploadProgressState } from "./chat-upload.lib";

export interface UseChatPageSendMessageParams {
  currentUserId: number | null;
  isDmView: boolean;
  activeDmUserIds: number[] | null;
  activeStream: string | null;
  activeStreamCanonicalName: string | null;
  activeStreamId: number | null | undefined;
  activeTopic: string | null | undefined;
  appendMessage: (message: MockMessage) => void;
  commitOutgoingMessage: (optimisticId: number, message: MockMessage) => void;
  removeMessage: (messageId: number) => void;
  requestScrollToBottom: () => void;
  clearReplyQuote: () => void;
  stopTyping: () => void;
  setSendError: (message: string | null) => void;
  setUploadProgress: (progress: ComposerUploadProgressState | null) => void;
}

export interface UseChatPageSendMessageResult {
  handleSend: (content: string, subjectOverride?: string, files?: File[]) => Promise<void>;
  handleRetryFailedOutgoing: (msg: MockMessage) => Promise<void>;
  handleRemoveFailedOutgoing: (msg: MockMessage) => void;
  handleCancelUpload: () => void;
}

export function useChatPageSendMessage(
  params: UseChatPageSendMessageParams,
): UseChatPageSendMessageResult {
  const {
    currentUserId,
    isDmView,
    activeDmUserIds,
    activeStream,
    activeStreamCanonicalName,
    activeStreamId,
    activeTopic,
    appendMessage,
    commitOutgoingMessage,
    removeMessage,
    requestScrollToBottom,
    clearReplyQuote,
    stopTyping,
    setSendError,
    setUploadProgress,
  } = params;

  const optimisticMessageIdRef = useRef(-1);
  const uploadAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      uploadAbortControllerRef.current?.abort();
      uploadAbortControllerRef.current = null;
    };
  }, []);

  const handleSend = useCallback(
    async (content: string, subjectOverride?: string, files?: File[]) => {
      await executeChatPageSend(
        {
          currentUserId,
          isDmView,
          activeDmUserIds,
          activeStream,
          activeStreamCanonicalName,
          activeStreamId,
          activeTopic,
          allocateOptimisticMessageId: () => {
            const id = optimisticMessageIdRef.current;
            optimisticMessageIdRef.current -= 1;
            return id;
          },
          appendMessage,
          commitOutgoingMessage,
          requestScrollToBottom,
          clearReplyQuote,
          stopTyping,
          setSendError,
          setUploadProgress,
          setUploadAbortController: (controller) => {
            uploadAbortControllerRef.current = controller;
          },
          releaseUploadAbortController: (controller) => {
            if (uploadAbortControllerRef.current === controller) {
              uploadAbortControllerRef.current = null;
            }
          },
        },
        content,
        subjectOverride,
        files,
      );
    },
    [
      currentUserId,
      isDmView,
      activeDmUserIds,
      activeStream,
      activeStreamCanonicalName,
      activeStreamId,
      activeTopic,
      appendMessage,
      commitOutgoingMessage,
      requestScrollToBottom,
      clearReplyQuote,
      stopTyping,
      setSendError,
      setUploadProgress,
    ],
  );

  const handleRemoveFailedOutgoing = useCallback(
    (msg: MockMessage) => {
      if (msg.delivery_status !== "failed" || msg.id >= 0) return;
      removeMessage(msg.id);
      setSendError(null);
    },
    [removeMessage, setSendError],
  );

  const handleRetryFailedOutgoing = useCallback(
    (msg: MockMessage) => {
      if (msg.delivery_status !== "failed" || msg.id >= 0) return Promise.resolve();
      setSendError(null);
      setSendError(t("message.sendFailed"));
      setUploadProgress(null);
      return Promise.resolve();
    },
    [setSendError, setUploadProgress],
  );

  const handleCancelUpload = useCallback(() => {
    const controller = uploadAbortControllerRef.current;
    if (controller == null || controller.signal.aborted) return;
    controller.abort();
  }, []);

  return {
    handleSend,
    handleRetryFailedOutgoing,
    handleRemoveFailedOutgoing,
    handleCancelUpload,
  };
}
