import { t } from "~/i18n/i18n";
import { sendMessage, uploadFile, type MockMessage } from "~/shared/api/zulip";
import { createLogger } from "~/shared/lib/logger";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";
import { isAbortLikeError } from "./chat-page-ai.lib";
import {
  buildOptimisticOutgoingMessage,
  markOutgoingMessageFailed,
  type OutgoingMessageTarget,
} from "./chat-send-delivery.lib";
import { uploadComposerFiles, type ComposerUploadProgressState } from "./chat-upload.lib";

const log = createLogger("chat-page");

export interface ChatPageSendHandlerDeps {
  currentUserId: number | null;
  isDmView: boolean;
  activeDmUserIds: number[] | null;
  activeStream: string | null;
  activeStreamCanonicalName: string | null;
  activeStreamId: number | null | undefined;
  activeTopic: string | null | undefined;
  allocateOptimisticMessageId: () => number;
  appendMessage: (message: MockMessage) => void;
  commitOutgoingMessage: (optimisticId: number, message: MockMessage) => void;
  requestScrollToBottom: () => void;
  clearReplyQuote: () => void;
  stopTyping: () => void;
  setSendError: (message: string | null) => void;
  setUploadProgress: (progress: ComposerUploadProgressState | null) => void;
  setUploadAbortController: (controller: AbortController | null) => void;
  releaseUploadAbortController: (controller: AbortController) => void;
}

async function prepareComposerBodyWithUploads(options: {
  content: string;
  files: File[] | undefined;
  setUploadProgress: ChatPageSendHandlerDeps["setUploadProgress"];
  setUploadAbortController: ChatPageSendHandlerDeps["setUploadAbortController"];
  releaseUploadAbortController: ChatPageSendHandlerDeps["releaseUploadAbortController"];
  setSendError: ChatPageSendHandlerDeps["setSendError"];
}): Promise<string> {
  const {
    content,
    files,
    setUploadProgress,
    setUploadAbortController,
    releaseUploadAbortController,
    setSendError,
  } = options;
  if (files == null || files.length === 0) return content;

  const uploadController = new AbortController();
  setUploadAbortController(uploadController);
  setUploadProgress({
    completed: 0,
    total: files.length,
    activeFileName: files[0]?.name ?? null,
  });

  try {
    const uploadedLinks = await uploadComposerFiles(files, uploadFile, {
      onProgress: setUploadProgress,
      signal: uploadController.signal,
    });
    return content + "\n" + uploadedLinks.join("\n");
  } catch (err) {
    const wasCancelled = isAbortLikeError(err) || uploadController.signal.aborted;
    const errorMessage = wasCancelled
      ? t("composer.uploadCancelled")
      : err instanceof Error
        ? err.message
        : t("message.sendFailed");
    setSendError(errorMessage);
    setUploadProgress(null);
    throw new Error(errorMessage, { cause: err });
  } finally {
    releaseUploadAbortController(uploadController);
  }
}

async function sendOutgoingMessageWithOptimisticUi(options: {
  deps: ChatPageSendHandlerDeps;
  body: string;
  target: OutgoingMessageTarget;
  apiPayload: Parameters<typeof sendMessage>[0];
}): Promise<void> {
  const { deps, body, target, apiPayload } = options;
  const optimisticMessageId = deps.allocateOptimisticMessageId();
  const optimisticMessage = buildOptimisticOutgoingMessage({
    id: optimisticMessageId,
    senderId: deps.currentUserId ?? 0,
    senderFullName: t("common.you"),
    content: body,
    target,
  });

  deps.appendMessage(optimisticMessage);
  deps.requestScrollToBottom();

  try {
    const newMsg = await sendMessage({
      ...apiPayload,
      sender_id: deps.currentUserId ?? 0,
      sender_full_name: t("common.you"),
      local_id: String(optimisticMessageId),
    });
    deps.commitOutgoingMessage(optimisticMessageId, newMsg);
    deps.clearReplyQuote();
    deps.stopTyping();
  } catch (err) {
    deps.appendMessage(markOutgoingMessageFailed(optimisticMessage));
    const message = err instanceof Error ? err.message : t("message.sendFailed");
    deps.setSendError(message);
    throw err instanceof Error ? err : new Error(t("message.sendFailed"));
  } finally {
    deps.setUploadProgress(null);
  }
}

/** Sends composer content (optional file uploads) to the active DM or stream narrow. */
export async function executeChatPageSend(
  deps: ChatPageSendHandlerDeps,
  content: string,
  subjectOverride?: string,
  files?: File[],
): Promise<void> {
  deps.setSendError(null);
  deps.setUploadProgress(null);

  const body = await prepareComposerBodyWithUploads({
    content,
    files,
    setUploadProgress: deps.setUploadProgress,
    setUploadAbortController: deps.setUploadAbortController,
    releaseUploadAbortController: deps.releaseUploadAbortController,
    setSendError: deps.setSendError,
  });

  if (deps.isDmView && deps.activeDmUserIds != null && deps.activeDmUserIds.length > 0) {
    await sendOutgoingMessageWithOptimisticUi({
      deps,
      body,
      target: { mode: "dm", recipientIds: deps.activeDmUserIds },
      apiPayload: { to: deps.activeDmUserIds, content: body },
    });
    return;
  }

  if (deps.activeStream == null) {
    deps.setUploadProgress(null);
    return;
  }

  if (deps.activeStreamCanonicalName == null) {
    log.warn("Blocked stream send without canonical stream name", {
      streamId: deps.activeStreamId ?? undefined,
      displayName: deps.activeStream,
    });
    const error = t("message.sendFailed");
    deps.setSendError(error);
    deps.setUploadProgress(null);
    throw new Error(error);
  }

  const subject = normalizeTopicForIdentity(subjectOverride ?? deps.activeTopic ?? "");
  await sendOutgoingMessageWithOptimisticUi({
    deps,
    body,
    target: {
      mode: "stream",
      stream: deps.activeStreamCanonicalName,
      streamId: deps.activeStreamId ?? undefined,
      subject,
    },
    apiPayload: {
      stream: deps.activeStreamCanonicalName,
      streamId: deps.activeStreamId ?? undefined,
      subject,
      content: body,
    },
  });
}
