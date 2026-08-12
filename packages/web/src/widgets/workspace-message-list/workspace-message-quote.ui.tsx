import React, { useCallback, useMemo } from "react";
import { useResolvedMessengerQuoteMessage } from "~/entities/messenger/messenger-quote-resolver.hook";
import { WorkspaceMessageBody } from "~/entities/messenger/messenger-workspace-message-body.ui";
import { selectUserDisplayName } from "~/entities/user/user-selectors.lib";
import { useUsersStore } from "~/entities/user/user.model";
import { t } from "~/i18n/i18n";
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

export const WorkspaceMessageQuote = React.memo(function WorkspaceMessageQuote({
  reference,
  mode = DEFAULT_WORKSPACE_QUOTE_RENDER_MODE,
  depth = 0,
  maxDepth = DEFAULT_WORKSPACE_QUOTE_MAX_DEPTH,
  visitedMessageUuids = new Set<string>(),
  resolveMention,
  onOpenMessage,
  loadEnabled = true,
}: WorkspaceMessageQuoteProps): React.ReactElement {
  const resolved = useResolvedMessengerQuoteMessage(reference.messageUuid, loadEnabled);
  const author = useUsersStore((state) =>
    resolved.message == null ? undefined : state.usersById[resolved.message.authorUuid],
  );
  let authorLabel = "";
  if (resolved.status === "loading") {
    authorLabel = reference.fallbackAuthorLabel.trim() || t("composer.quote");
  } else if (resolved.status === "ready") {
    authorLabel = selectUserDisplayName(
      author,
      reference.fallbackAuthorLabel.trim() || t("composer.quote"),
    );
  }
  const sourceMarkdown =
    resolved.status === "ready" && resolved.message != null ? resolved.message.payload.content : "";
  const renderedSource = useMemo(() => {
    if (resolved.status !== "ready" || reference.selectedText != null) {
      return null;
    }
    const document = parseWorkspaceMessageBody(sourceMarkdown, { resolveMention });
    return renderWorkspaceMessageBodySegments(document, QUOTE_RENDER_OPTIONS);
  }, [reference.selectedText, resolveMention, resolved.status, sourceMarkdown]);
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
        loadEnabled={loadEnabled}
      />
    ),
    [depth, loadEnabled, maxDepth, mode, nextVisitedMessageUuids, onOpenMessage, resolveMention],
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
  let headerLabel = authorLabel;
  let messageContent: React.ReactNode = null;
  if (resolved.status === "unavailable") {
    headerLabel = t("message.quoteUnavailable");
  } else if (resolved.status === "loading") {
    messageContent = <span className="text-xs text-text-muted">{t("chat.loadingMessages")}</span>;
  } else if (reference.selectedText != null) {
    messageContent = (
      <div className="whitespace-pre-wrap break-words text-sm">{reference.selectedText}</div>
    );
  } else if (renderedSource != null) {
    messageContent = (
      <WorkspaceMessageBody
        html={renderedHtml}
        segments={visibleSegments}
        renderQuote={renderNestedQuote}
        metadata={renderedSource.metadata}
        useInlineMeta={false}
      />
    );
  }

  return (
    <WorkspaceMessageQuoteFrame
      header={headerLabel}
      headerMuted={resolved.status === "unavailable"}
      headerProps={{ "data-workspace-quote-open": "true" }}
      className={onOpenMessage == null ? "" : "cursor-pointer"}
      data-workspace-quote="true"
      data-workspace-quote-mode={mode}
      data-workspace-quote-message-uuid={reference.messageUuid}
      data-workspace-quote-status={resolved.status}
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
