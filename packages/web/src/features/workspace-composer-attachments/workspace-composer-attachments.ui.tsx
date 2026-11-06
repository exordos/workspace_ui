import React, { useCallback, useMemo } from "react";
import type { MessengerSendOptions } from "~/entities/messenger/messenger-outbox.types";
import { buildMessengerRequestOptions } from "~/entities/messenger/messenger-request-options.lib";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { isWorkspaceRuntimeRequestInvalidated } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { t } from "~/i18n/i18n";
import {
  deleteWorkspaceFile,
  uploadWorkspaceFileWithProgress,
} from "~/shared/api/messenger-files.api";
import { useWorkspaceComposerAttachments } from "./workspace-composer-attachments.hook";
import {
  buildWorkspaceComposerAttachmentMarkdown,
  buildWorkspaceComposerAttachmentMetadata,
  prependWorkspaceComposerAttachmentMarkdown,
} from "./workspace-composer-attachments.lib";
import { prependWorkspaceComposerEditAttachmentMarkdown } from "./workspace-composer-edit-attachments.lib";
import type {
  WorkspaceComposerAttachmentRequestContext,
  WorkspaceComposerAttachmentUploadContext,
  WorkspaceComposerAttachmentView,
  WorkspaceComposerReadyAttachmentTransfer,
} from "./workspace-composer-attachments.types";

export interface WorkspaceComposerAttachmentTarget {
  conversationId: string;
  streamUuid: string;
  topicUuid: string;
  includeStreamConversation: boolean;
}

export interface WorkspaceComposerSendResult {
  shouldClearComposer?: boolean;
}

export interface WorkspaceComposerControlledAttachmentView {
  localId: string;
  fileName: string;
  sizeBytes: number;
  contentType: string;
  previewUrl: string | null;
  status: "validating" | "queued" | "uploading" | "ready" | "error";
  loadedBytes: number;
  totalBytes: number | null;
  error: string | null;
  retryable: boolean;
  previewMarkdown?: string;
}

export interface WorkspaceComposerControlledProps {
  onSend: (
    content: string,
    subjectOverride?: string,
    files?: File[],
    options?: MessengerSendOptions,
  ) => void | WorkspaceComposerSendResult | Promise<void | WorkspaceComposerSendResult>;
  attachments: readonly WorkspaceComposerControlledAttachmentView[];
  attachmentsBlockSend: boolean;
  onAddAttachments: (files: readonly File[]) => void;
  onRemoveAttachment: (localId: string) => void;
  onRetryAttachment: (localId: string) => void;
  onSubmitEdit?: (messageId: number, content: string) => void | Promise<void>;
}

interface WorkspaceComposerAttachmentsProps {
  runtimeContext: WorkspaceRuntimeContext;
  ownerKey: string;
  target: WorkspaceComposerAttachmentTarget;
  sessionKey?: string;
  onSendFinalMarkdown: (
    markdown: string,
    subjectOverride?: string,
    files?: File[],
    options?: MessengerSendOptions,
  ) => void | WorkspaceComposerSendResult | Promise<void | WorkspaceComposerSendResult>;
  editAttachmentMarkdown?: readonly string[];
  onSubmitEditFinalMarkdown?: (messageId: number, markdown: string) => void | Promise<void>;
  renderComposer: (props: WorkspaceComposerControlledProps) => React.ReactNode;
}

function localizedError(attachment: WorkspaceComposerAttachmentView): string | null {
  if (attachment.error == null) return null;
  if (attachment.errorKind === "upload") return t("attachmentCard.uploadError");
  if (attachment.error === "File is empty") return t("attachmentCard.fileEmpty");
  if (attachment.error.startsWith("File is too large")) return t("attachmentCard.fileTooLarge");
  if (attachment.error === "Image file type is invalid") return t("attachmentCard.invalidImage");
  return t("attachmentCard.validationError");
}

export const WorkspaceComposerAttachments = React.memo(function WorkspaceComposerAttachments({
  runtimeContext,
  ownerKey,
  target,
  sessionKey = "compose",
  onSendFinalMarkdown,
  editAttachmentMarkdown = [],
  onSubmitEditFinalMarkdown,
  renderComposer,
}: Readonly<WorkspaceComposerAttachmentsProps>) {
  const scope = useMemo(
    () => ({
      ownerKey,
      runtimeGeneration: runtimeContext.runtimeGeneration,
      scopeKey: JSON.stringify([
        target.conversationId,
        target.streamUuid,
        target.topicUuid,
        target.includeStreamConversation,
        sessionKey,
      ]),
    }),
    [
      ownerKey,
      runtimeContext.runtimeGeneration,
      target.conversationId,
      target.includeStreamConversation,
      target.streamUuid,
      target.topicUuid,
      sessionKey,
    ],
  );
  const transport = useMemo(
    () => ({
      upload: async (file: File, context: WorkspaceComposerAttachmentUploadContext) => {
        const uploaded = await uploadWorkspaceFileWithProgress(
          buildMessengerRequestOptions(runtimeContext, undefined, context.signal),
          {
            file,
            streamUuid: target.streamUuid,
            name: file.name,
            onProgress: ({ loaded, total }) => context.onProgress(loaded, total),
          },
        );
        if (
          isWorkspaceRuntimeRequestInvalidated(
            runtimeContext,
            () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
            context.signal,
          )
        ) {
          deleteWorkspaceFile(buildMessengerRequestOptions(runtimeContext), uploaded.uuid).catch(
            () => undefined,
          );
          throw new DOMException("Stale Workspace upload", "AbortError");
        }
        return buildWorkspaceComposerAttachmentMetadata(file, uploaded, {
          signal: context.signal,
        });
      },
      delete: (metadata: { uuid: string }, context: WorkspaceComposerAttachmentRequestContext) =>
        deleteWorkspaceFile(
          buildMessengerRequestOptions(runtimeContext, undefined, context.signal),
          metadata.uuid,
        ),
    }),
    [runtimeContext, target.streamUuid],
  );
  const { attachments, attachmentsBlockSend, add, remove, retry, commitReady } =
    useWorkspaceComposerAttachments({ scope, transport });
  const composerAttachments = useMemo<WorkspaceComposerControlledAttachmentView[]>(
    () =>
      attachments.map((attachment) => ({
        localId: attachment.localId,
        fileName: attachment.fileName,
        sizeBytes: attachment.sizeBytes,
        contentType: attachment.contentType,
        previewUrl: attachment.previewUrl,
        status: attachment.status,
        loadedBytes: attachment.loadedBytes,
        totalBytes: attachment.totalBytes,
        error: localizedError(attachment),
        retryable: attachment.status === "error" && attachment.errorKind === "upload",
        previewMarkdown: attachment.serverMetadata?.markdownLink,
      })),
    [attachments],
  );
  const handleSend = useCallback(
    (content: string, subjectOverride?: string, files?: File[], options?: MessengerSendOptions) => {
      if (attachments.length === 0)
        return options == null
          ? onSendFinalMarkdown(content, subjectOverride)
          : onSendFinalMarkdown(content, subjectOverride, files, options);
      const sendReady = (
        ready: readonly WorkspaceComposerReadyAttachmentTransfer[],
        onAccepted: () => void,
      ) => {
        const markdown = prependWorkspaceComposerAttachmentMarkdown(
          content,
          ready.map((attachment: WorkspaceComposerReadyAttachmentTransfer) =>
            buildWorkspaceComposerAttachmentMarkdown(attachment.serverMetadata),
          ),
        );
        return onSendFinalMarkdown(markdown, subjectOverride, files, {
          ...options,
          onAccepted: () => {
            options?.onAccepted?.();
            onAccepted();
          },
        });
      };
      return commitReady(async (ready) => {
        let result: ReturnType<typeof onSendFinalMarkdown>;
        await new Promise<void>((resolve, reject) => {
          try {
            result = sendReady(ready, resolve);
            // Legacy consumers accept on normal completion; outbox consumers acknowledge earlier.
            void Promise.resolve(result).then(() => resolve(), reject);
          } catch (error) {
            reject(error instanceof Error ? error : new Error(t("message.sendFailed")));
          }
        });
        return { result: result! };
      }).then((accepted) => {
        if (accepted == null) throw new Error(t("attachmentCard.uploadPending"));
        return accepted.result;
      });
    },
    [attachments.length, onSendFinalMarkdown, commitReady],
  );
  const handleSubmitEdit = useCallback(
    async (messageId: number, content: string) => {
      if (onSubmitEditFinalMarkdown == null) return;
      if (attachmentsBlockSend) {
        throw new Error(t("attachmentCard.uploadPending"));
      }
      const result = await commitReady(async (ready) => {
        const markdown = prependWorkspaceComposerEditAttachmentMarkdown(content, [
          ...editAttachmentMarkdown,
          ...ready.map((attachment) =>
            buildWorkspaceComposerAttachmentMarkdown(attachment.serverMetadata),
          ),
        ]);
        await onSubmitEditFinalMarkdown(messageId, markdown);
        return true;
      });
      if (result !== true) {
        throw new Error(t("attachmentCard.uploadPending"));
      }
    },
    [attachmentsBlockSend, commitReady, editAttachmentMarkdown, onSubmitEditFinalMarkdown],
  );

  return renderComposer({
    onSend: handleSend,
    attachments: composerAttachments,
    attachmentsBlockSend,
    onAddAttachments: add,
    onRemoveAttachment: remove,
    onRetryAttachment: retry,
    ...(onSubmitEditFinalMarkdown == null ? {} : { onSubmitEdit: handleSubmitEdit }),
  });
});
