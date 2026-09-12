import React, { useCallback, useMemo, useState } from "react";
import {
  useResolvedMessengerQuoteMessage,
  type ResolvedMessengerQuoteMessage,
} from "~/entities/messenger/messenger-quote-resolver.hook";
import {
  WorkspaceMessageMediaThumbnail,
  type WorkspaceMessageMediaThumbnailStatus,
} from "~/entities/messenger/messenger-workspace-media-thumbnail.ui";
import {
  collectWorkspaceMessagePreviewFileReferences,
  selectWorkspaceMessageMediaPreviewReference,
} from "~/entities/messenger/messenger-workspace-message-body-files.lib";
import { WorkspaceMessageBody } from "~/entities/messenger/messenger-workspace-message-body.ui";
import { selectUserDisplayName } from "~/entities/user/user-selectors.lib";
import { useUsersStore } from "~/entities/user/user.model";
import type { User } from "~/entities/user/user.types";
import { t } from "~/i18n/i18n";
import { formatMessageTimeWithDate } from "~/shared/lib/datetime.lib";
import type { WorkspaceMessageBodyQuoteSegment } from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import { parseWorkspaceMessageBody } from "~/shared/lib/workspace-message-render/workspace-message-parse.lib";
import { DEFAULT_WORKSPACE_MESSAGE_RENDER_OPTIONS } from "~/shared/lib/workspace-message-render/workspace-message-render-options.lib";
import { renderWorkspaceMessageBodySegments } from "~/shared/lib/workspace-message-render/workspace-message-render.lib";
import { WorkspaceMessageQuoteFrame } from "~/shared/ui/workspace-message-quote-frame.ui";
import {
  DEFAULT_WORKSPACE_QUOTE_MAX_DEPTH,
  DEFAULT_WORKSPACE_QUOTE_RENDER_MODE,
  type WorkspaceMessageQuoteProps,
} from "./workspace-message-quote.types";

const QUOTE_RENDER_OPTIONS = {
  ...DEFAULT_WORKSPACE_MESSAGE_RENDER_OPTIONS,
  enableCodeCopy: false,
  enableProtectedMedia: false,
  enableAttachments: false,
  enableGallery: false,
} as const;

function resolveQuoteAuthorLabel(options: {
  isForwardSnapshot: boolean;
  status: ResolvedMessengerQuoteMessage["status"];
  author: User | undefined;
  fallbackAuthorLabel: string;
}): string {
  const fallback = options.fallbackAuthorLabel.trim() || t("composer.quote");
  if (options.isForwardSnapshot || options.status === "loading") return fallback;
  return options.status === "ready" ? selectUserDisplayName(options.author, fallback) : "";
}

const ForwardSnapshotHeader = React.memo(function ForwardSnapshotHeader({
  authorLabel,
  sourceLabel,
  sourceKind,
  sourceCreatedAt,
}: {
  authorLabel: string;
  sourceLabel?: string;
  sourceKind?: "direct";
  sourceCreatedAt?: string;
}): React.ReactElement {
  const sourceTime = useMemo(() => {
    if (sourceCreatedAt == null) return null;
    const timestampMs = Date.parse(sourceCreatedAt);
    return Number.isFinite(timestampMs)
      ? formatMessageTimeWithDate(Math.floor(timestampMs / 1000))
      : null;
  }, [sourceCreatedAt]);

  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      <span className="shrink-0 truncate text-accent">{authorLabel}</span>
      {sourceLabel != null ? (
        <span
          className="min-w-0 truncate border-l-2 border-accent pl-1 text-text-muted"
          title={sourceLabel}
        >
          {sourceKind === "direct" ? sourceLabel : `# ${sourceLabel}`}
        </span>
      ) : null}
      {sourceTime != null ? (
        <time className="ml-auto shrink-0 font-normal text-text-muted" dateTime={sourceCreatedAt}>
          {sourceTime}
        </time>
      ) : null}
    </span>
  );
});

function resolveQuotePresentation(options: {
  isForwardSnapshot: boolean;
  resolvedStatus: ResolvedMessengerQuoteMessage["status"];
  authorLabel: string;
  selectedText?: string;
  renderedSource: ReturnType<typeof renderWorkspaceMessageBodySegments> | null;
  renderedHtml: string;
  visibleSegments: ReturnType<typeof renderWorkspaceMessageBodySegments>["segments"];
  renderNestedQuote: (segment: WorkspaceMessageBodyQuoteSegment) => React.ReactNode;
}): { headerLabel: string; messageContent: React.ReactNode } {
  if (!options.isForwardSnapshot && options.resolvedStatus === "unavailable") {
    return { headerLabel: t("message.quoteUnavailable"), messageContent: null };
  }
  if (!options.isForwardSnapshot && options.resolvedStatus === "loading") {
    return {
      headerLabel: options.authorLabel,
      messageContent: <span className="text-xs text-text-muted">{t("chat.loadingMessages")}</span>,
    };
  }
  if (options.selectedText != null) {
    return {
      headerLabel: options.authorLabel,
      messageContent: (
        <div className="whitespace-pre-wrap break-words text-sm">{options.selectedText}</div>
      ),
    };
  }
  if (options.renderedSource != null) {
    return {
      headerLabel: options.authorLabel,
      messageContent: (
        <WorkspaceMessageBody
          html={options.renderedHtml}
          segments={options.visibleSegments}
          renderQuote={options.renderNestedQuote}
          metadata={options.renderedSource.metadata}
          useInlineMeta={false}
        />
      ),
    };
  }
  return { headerLabel: options.authorLabel, messageContent: null };
}

export const WorkspaceMessageQuote = React.memo(function WorkspaceMessageQuote({
  reference,
  mode = DEFAULT_WORKSPACE_QUOTE_RENDER_MODE,
  depth = 0,
  maxDepth = DEFAULT_WORKSPACE_QUOTE_MAX_DEPTH,
  visitedMessageUuids = new Set<string>(),
  resolveMention,
  onOpenMessage,
  onLoadWorkspaceFilePreview,
  loadEnabled = true,
}: WorkspaceMessageQuoteProps): React.ReactElement {
  const isForwardSnapshot = reference.snapshotMarkdown != null;
  const resolved = useResolvedMessengerQuoteMessage(
    reference.messageUuid,
    loadEnabled && !isForwardSnapshot,
  );
  const [readyMediaFileUuid, setReadyMediaFileUuid] = useState<string | null>(null);
  const handleMediaThumbnailStatusChange = useCallback(
    (fileUuid: string, status: WorkspaceMessageMediaThumbnailStatus) => {
      setReadyMediaFileUuid(status === "ready" ? fileUuid : null);
    },
    [],
  );
  const author = useUsersStore((state) =>
    resolved.message == null ? undefined : state.usersById[resolved.message.authorUuid],
  );
  const authorLabel = resolveQuoteAuthorLabel({
    isForwardSnapshot,
    status: resolved.status,
    author,
    fallbackAuthorLabel: reference.fallbackAuthorLabel,
  });
  const header = isForwardSnapshot ? (
    <ForwardSnapshotHeader
      authorLabel={authorLabel}
      sourceLabel={reference.sourceLabel}
      sourceKind={reference.sourceKind}
      sourceCreatedAt={reference.sourceCreatedAt}
    />
  ) : (
    authorLabel
  );
  const sourceMarkdown =
    reference.snapshotMarkdown ??
    (resolved.status === "ready" && resolved.message != null
      ? resolved.message.payload.content
      : "");
  const sourceDocument = useMemo(() => {
    if ((!isForwardSnapshot && resolved.status !== "ready") || reference.selectedText != null) {
      return null;
    }
    const document = parseWorkspaceMessageBody(sourceMarkdown, { resolveMention });
    const previewReferences = collectWorkspaceMessagePreviewFileReferences(document);
    return {
      document,
      mediaReference: isForwardSnapshot
        ? null
        : selectWorkspaceMessageMediaPreviewReference(document),
      mediaFileUuids: new Set(
        previewReferences
          .filter((reference) => reference.kind === "media")
          .map((reference) => reference.fileUuid),
      ),
    };
  }, [isForwardSnapshot, reference.selectedText, resolveMention, resolved.status, sourceMarkdown]);
  const renderedSource = useMemo(() => {
    if (sourceDocument == null) return null;
    const { document, mediaFileUuids, mediaReference } = sourceDocument;
    const renderOptions =
      readyMediaFileUuid != null &&
      mediaReference?.fileUuid === readyMediaFileUuid &&
      onLoadWorkspaceFilePreview != null
        ? { ...QUOTE_RENDER_OPTIONS, hiddenWorkspaceMediaFileUuids: mediaFileUuids }
        : QUOTE_RENDER_OPTIONS;
    return renderWorkspaceMessageBodySegments(document, renderOptions);
  }, [onLoadWorkspaceFilePreview, readyMediaFileUuid, sourceDocument]);
  const isCycle = visitedMessageUuids.has(reference.messageUuid);
  const canExpandNestedQuotes =
    mode === "full-history" && !isCycle && depth < Math.max(0, maxDepth);
  const nextVisitedMessageUuids = useMemo(() => {
    const next = new Set(visitedMessageUuids);
    next.add(reference.messageUuid);
    return next;
  }, [reference.messageUuid, visitedMessageUuids]);
  const visibleSegments = useMemo(
    () =>
      renderedSource?.segments.filter(
        (segment) => segment.kind === "html" || canExpandNestedQuotes,
      ) ?? [],
    [canExpandNestedQuotes, renderedSource?.segments],
  );
  const renderedHtml = useMemo(
    () =>
      visibleSegments
        .filter((segment) => segment.kind === "html")
        .map((segment) => segment.html)
        .join(""),
    [visibleSegments],
  );
  const renderNestedQuote = useCallback(
    (segment: WorkspaceMessageBodyQuoteSegment): React.ReactNode => (
      <WorkspaceMessageQuote
        reference={segment.reference}
        mode={mode}
        depth={depth + 1}
        maxDepth={maxDepth}
        visitedMessageUuids={nextVisitedMessageUuids}
        resolveMention={resolveMention}
        onOpenMessage={onOpenMessage}
        onLoadWorkspaceFilePreview={onLoadWorkspaceFilePreview}
        loadEnabled={loadEnabled}
      />
    ),
    [
      depth,
      loadEnabled,
      maxDepth,
      mode,
      nextVisitedMessageUuids,
      onLoadWorkspaceFilePreview,
      onOpenMessage,
      resolveMention,
    ],
  );
  const openMessage = useCallback(() => {
    onOpenMessage?.(reference.messageUuid);
  }, [onOpenMessage, reference.messageUuid]);
  const handleBlockClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (onOpenMessage == null) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      const interactiveTarget = target.closest(
        "a, button, input, textarea, select, [role='button'], [role='link']",
      );
      if (interactiveTarget != null && interactiveTarget !== event.currentTarget) {
        return;
      }
      if (target.closest("[data-workspace-quote='true']") !== event.currentTarget) return;
      const selection = window.getSelection();
      if (selection != null && !selection.isCollapsed) return;

      event.stopPropagation();
      openMessage();
    },
    [onOpenMessage, openMessage],
  );
  const handleBlockKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (onOpenMessage == null || event.key !== "Enter") {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;
      const interactiveTarget = target.closest(
        "a, button, input, textarea, select, [role='button'], [role='link']",
      );
      if (interactiveTarget !== event.currentTarget) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      openMessage();
    },
    [onOpenMessage, openMessage],
  );
  const { headerLabel, messageContent } = resolveQuotePresentation({
    isForwardSnapshot,
    resolvedStatus: resolved.status,
    authorLabel,
    selectedText: reference.selectedText,
    renderedSource,
    renderedHtml,
    visibleSegments,
    renderNestedQuote,
  });

  return (
    <WorkspaceMessageQuoteFrame
      header={isForwardSnapshot ? header : headerLabel}
      headerMuted={!isForwardSnapshot && resolved.status === "unavailable"}
      leading={
        !isForwardSnapshot &&
        sourceDocument?.mediaReference != null &&
        onLoadWorkspaceFilePreview != null ? (
          <WorkspaceMessageMediaThumbnail
            key={sourceDocument.mediaReference.fileUuid}
            reference={sourceDocument.mediaReference}
            onLoadWorkspaceFilePreview={onLoadWorkspaceFilePreview}
            onStatusChange={handleMediaThumbnailStatusChange}
          />
        ) : null
      }
      headerProps={{
        "data-workspace-quote-open": "true",
        className: isForwardSnapshot ? "mb-1" : "",
      }}
      className={onOpenMessage == null ? "" : "cursor-pointer"}
      data-workspace-quote="true"
      data-workspace-quote-mode={mode}
      data-workspace-quote-message-uuid={reference.messageUuid}
      data-workspace-quote-status={isForwardSnapshot ? "snapshot" : resolved.status}
      role="link"
      tabIndex={onOpenMessage == null ? -1 : 0}
      aria-disabled={onOpenMessage == null}
      aria-label={t("message.openInChat")}
      onClick={onOpenMessage == null ? undefined : handleBlockClick}
      onKeyDown={onOpenMessage == null ? undefined : handleBlockKeyDown}
    >
      {messageContent}
    </WorkspaceMessageQuoteFrame>
  );
});
