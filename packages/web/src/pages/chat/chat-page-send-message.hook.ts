/**
 * Outgoing message send, retry, and upload cancellation for the chat page.
 */
import { useCallback, useEffect, useRef } from "react";
import { t } from "~/i18n/i18n";
import { sendMessage } from "~/shared/api/zulip-messages";
import type { MockMessage } from "~/shared/api/zulip.types";
import { createLogger } from "~/shared/lib/logger";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import { executeChatPageSend } from "./chat-page-send-handler.lib";
import {
  buildOptimisticOutgoingMessage,
  markOutgoingMessageFailed,
} from "./chat-send-delivery.lib";
import type { ComposerUploadProgressState } from "./chat-upload.lib";

const log = createLogger("chat-page");

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
    async (msg: MockMessage) => {
      if (msg.delivery_status !== "failed" || msg.id >= 0) return;
      setSendError(null);
      const body = msg.content;
      removeMessage(msg.id);

      const stopTypingAfterSend = () => {
        stopTyping();
      };

      if (isDmView && activeDmUserIds?.length) {
        const optimisticMessageId = optimisticMessageIdRef.current;
        optimisticMessageIdRef.current -= 1;
        const optimisticMessage = buildOptimisticOutgoingMessage({
          id: optimisticMessageId,
          senderId: currentUserId ?? 0,
          senderFullName: t("common.you"),
          content: body,
          target: { mode: "dm", recipientIds: activeDmUserIds },
        });
        appendMessage(optimisticMessage);
        requestScrollToBottom();
        try {
          const newMsg = await sendMessage({
            to: activeDmUserIds,
            content: body,
            sender_id: currentUserId ?? 0,
            sender_full_name: t("common.you"),
            local_id: String(optimisticMessageId),
          });
          commitOutgoingMessage(optimisticMessageId, newMsg);
          clearReplyQuote();
          stopTypingAfterSend();
        } catch (err) {
          removeMessage(optimisticMessageId);
          appendMessage(markOutgoingMessageFailed(optimisticMessage));
          setSendError(err instanceof Error ? err.message : t("message.sendFailed"));
        } finally {
          setUploadProgress(null);
        }
        return;
      }
      if (activeStream) {
        if (!activeStreamCanonicalName) {
          log.warn("Blocked retry for failed stream message without canonical stream name", {
            streamId: activeStreamId ?? undefined,
            displayName: activeStream,
            failedMessageId: msg.id,
          });
          setSendError(t("message.sendFailed"));
          return;
        }
        const subject = normalizeTopicForIdentity(msg.subject ?? activeTopic ?? "");
        const optimisticMessageId = optimisticMessageIdRef.current;
        optimisticMessageIdRef.current -= 1;
        const optimisticMessage = buildOptimisticOutgoingMessage({
          id: optimisticMessageId,
          senderId: currentUserId ?? 0,
          senderFullName: t("common.you"),
          content: body,
          target: {
            mode: "stream",
            stream: activeStreamCanonicalName,
            streamId: activeStreamId ?? undefined,
            subject,
          },
        });
        appendMessage(optimisticMessage);
        requestScrollToBottom();
        try {
          const newMsg = await sendMessage({
            stream: activeStreamCanonicalName,
            streamId: activeStreamId ?? undefined,
            subject,
            content: body,
            sender_id: currentUserId ?? 0,
            sender_full_name: t("common.you"),
            local_id: String(optimisticMessageId),
          });
          commitOutgoingMessage(optimisticMessageId, newMsg);
          clearReplyQuote();
          stopTypingAfterSend();
        } catch (err) {
          removeMessage(optimisticMessageId);
          appendMessage(markOutgoingMessageFailed(optimisticMessage));
          setSendError(err instanceof Error ? err.message : t("message.sendFailed"));
        } finally {
          setUploadProgress(null);
        }
      }
    },
    [
      activeDmUserIds,
      activeStream,
      activeStreamCanonicalName,
      activeStreamId,
      activeTopic,
      appendMessage,
      clearReplyQuote,
      commitOutgoingMessage,
      currentUserId,
      isDmView,
      removeMessage,
      requestScrollToBottom,
      setSendError,
      setUploadProgress,
      stopTyping,
    ],
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
