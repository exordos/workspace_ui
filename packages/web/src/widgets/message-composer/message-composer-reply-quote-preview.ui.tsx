import React, { useCallback, useMemo, useState } from "react";
import {
  WorkspaceMessageMediaThumbnail,
  type WorkspaceMessageMediaThumbnailStatus,
} from "~/entities/messenger/messenger-workspace-media-thumbnail.ui";
import {
  collectWorkspaceMessagePreviewFileReferences,
  selectWorkspaceMessageMediaPreviewReference,
} from "~/entities/messenger/messenger-workspace-message-body-files.lib";
import type { LoadWorkspaceFilePreview } from "~/entities/messenger/messenger-workspace-message-file-preview.hook";
import { t } from "~/i18n/i18n";
import { parseWorkspaceMessageBody } from "~/shared/lib/workspace-message-render/workspace-message-parse.lib";
import {
  summarizeWorkspaceMessageBody,
  summarizeWorkspaceMessageMarkdown,
} from "~/shared/lib/workspace-message-render/workspace-message-summary.lib";
import { WorkspaceMessageQuoteFrame } from "~/shared/ui/workspace-message-quote-frame.ui";
import { QUOTE_PREVIEW_MAX } from "./message-composer-constants.lib";
import type { ReplyQuote } from "./message-composer.types";

const SUMMARY_OPTIONS = {
  maxLength: QUOTE_PREVIEW_MAX,
  includeMediaLabel: true,
  includeAttachmentLabel: true,
  includeQuotePrefix: false,
} as const;

function buildReplyQuotePreviewSource(content: string, quoteFormat: ReplyQuote["quoteFormat"]) {
  if (quoteFormat !== "workspace") {
    return {
      document: null,
      text: summarizeWorkspaceMessageMarkdown(content, SUMMARY_OPTIONS).text.trim(),
      mediaReference: null,
      mediaFileUuids: null,
    } as const;
  }

  const document = parseWorkspaceMessageBody(content);
  const previewReferences = collectWorkspaceMessagePreviewFileReferences(document);
  return {
    document,
    text: null,
    mediaReference: selectWorkspaceMessageMediaPreviewReference(document),
    mediaFileUuids: new Set(
      previewReferences
        .filter((reference) => reference.kind === "media")
        .map((reference) => reference.fileUuid),
    ),
  } as const;
}

interface MessageComposerReplyQuotePreviewProps {
  replyQuote: ReplyQuote;
  onLoadWorkspaceFilePreview?: LoadWorkspaceFilePreview;
}

export const MessageComposerReplyQuotePreview = React.memo(
  function MessageComposerReplyQuotePreview({
    replyQuote,
    onLoadWorkspaceFilePreview,
  }: Readonly<MessageComposerReplyQuotePreviewProps>) {
    const { content, quoteFormat } = replyQuote;
    const [readyMediaFileUuid, setReadyMediaFileUuid] = useState<string | null>(null);
    const handleMediaThumbnailStatusChange = useCallback(
      (fileUuid: string, status: WorkspaceMessageMediaThumbnailStatus) => {
        setReadyMediaFileUuid(status === "ready" ? fileUuid : null);
      },
      [],
    );
    const source = useMemo(
      () => buildReplyQuotePreviewSource(content, quoteFormat),
      [content, quoteFormat],
    );
    const text = useMemo(() => {
      if (source.document == null) return source.text;
      const summaryOptions =
        readyMediaFileUuid != null &&
        source.mediaReference?.fileUuid === readyMediaFileUuid &&
        onLoadWorkspaceFilePreview != null
          ? { ...SUMMARY_OPTIONS, hiddenWorkspaceMediaFileUuids: source.mediaFileUuids }
          : SUMMARY_OPTIONS;
      return summarizeWorkspaceMessageBody(source.document, summaryOptions).text.trim();
    }, [onLoadWorkspaceFilePreview, readyMediaFileUuid, source]);
    const mediaThumbnail =
      source.mediaReference != null && onLoadWorkspaceFilePreview != null ? (
        <WorkspaceMessageMediaThumbnail
          key={source.mediaReference.fileUuid}
          reference={source.mediaReference}
          onLoadWorkspaceFilePreview={onLoadWorkspaceFilePreview}
          onStatusChange={handleMediaThumbnailStatusChange}
        />
      ) : null;

    return (
      <WorkspaceMessageQuoteFrame
        className="my-0"
        surface="composer"
        data-composer-reply-quote="true"
        header={`${t("message.replyTo")}: ${replyQuote.sender_full_name}`}
        leading={mediaThumbnail}
      >
        {text.length > 0 ? (
          <p className="line-clamp-2 whitespace-pre-wrap break-words text-sm text-text-primary">
            {text}
          </p>
        ) : null}
      </WorkspaceMessageQuoteFrame>
    );
  },
);

MessageComposerReplyQuotePreview.displayName = "MessageComposerReplyQuotePreview";
