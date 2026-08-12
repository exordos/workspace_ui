import React, { useEffect, useState } from "react";
import type { MessengerUuid } from "~/entities/messenger/messenger.types";
import { selectUserDisplayName } from "~/entities/user/user-selectors.lib";
import type { UsersById } from "~/entities/user/user.types";
import { WorkspaceAvatar } from "~/features/workspace-avatar/workspace-avatar.ui";
import type { WorkspaceMessageAnchorPreviewPresentation } from "~/features/workspace-message-anchor-navigation/workspace-message-anchor-navigation.types";
import { t } from "~/i18n/i18n";
import type { WorkspaceMessageMentionResolver } from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import { FloatingScrollToBottomButton } from "~/shared/ui/floating-scroll-to-bottom-button";
import { WorkspaceMessageBubbleSkeleton } from "./workspace-message-bubble-skeleton.ui";
import { WorkspaceMessageBubble } from "./workspace-message-bubble.ui";
import { createWorkspaceMessageListServerItem } from "./workspace-message-list-grouping.lib";
import type { WorkspaceMessageListServerItem } from "./workspace-message-list.types";

interface WorkspaceMessageAnchorTransitionProps {
  presentation: WorkspaceMessageAnchorPreviewPresentation;
  currentUserUuid: MessengerUuid;
  usersById: UsersById;
  errorDetail?: string | null;
  onRetry: () => void;
  onTailNavigationRequested?: () => void;
  resolveAuthorLabel?: (authorUuid: MessengerUuid) => string | null | undefined;
  resolveMention?: WorkspaceMessageMentionResolver;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function WorkspaceMessageAnchorPreviewRow({
  item,
  currentUserUuid,
  usersById,
  resolveAuthorLabel,
  resolveMention,
}: Pick<
  WorkspaceMessageAnchorTransitionProps,
  "currentUserUuid" | "usersById" | "resolveAuthorLabel" | "resolveMention"
> & { item: WorkspaceMessageListServerItem }): React.ReactElement {
  const isOwn = item.isOwn || item.authorUuid === currentUserUuid;
  const author = usersById[item.authorUuid];
  const resolvedLabel = resolveAuthorLabel?.(item.authorUuid)?.trim();
  const authorLabel =
    resolvedLabel != null && resolvedLabel.length > 0
      ? resolvedLabel
      : selectUserDisplayName(author, `#${item.authorUuid.trim().slice(0, 8)}`);
  const bubble = (
    <WorkspaceMessageBubble
      message={item}
      currentUserUuid={currentUserUuid}
      usersById={usersById}
      isFirstInGroup
      isLastInGroup
      resolveAuthorLabel={resolveAuthorLabel}
      resolveMention={resolveMention}
      presentationMode="preview"
    />
  );

  if (isOwn) {
    return (
      <div className="flex w-full max-w-2xl justify-end" data-preview-alignment="own">
        <div className="contents">{bubble}</div>
      </div>
    );
  }

  return (
    <div
      className="flex w-full items-stretch gap-2"
      data-preview-alignment="peer"
      data-author-group="true"
    >
      <div
        className="flex w-12 flex-shrink-0 flex-col justify-end pb-2"
        data-preview-peer-avatar-slot="true"
        data-workspace-peer-avatar="true"
      >
        <WorkspaceAvatar
          size="lg"
          className="bg-bg-elevated text-accent-soft"
          avatarUrn={author?.avatarUrl}
          imageLoading="lazy"
        >
          {authorLabel.slice(0, 1)}
        </WorkspaceAvatar>
      </div>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <div
          className="relative flex w-full justify-start self-stretch"
          data-preview-peer-row="true"
        >
          {bubble}
        </div>
      </div>
    </div>
  );
}

export const WorkspaceMessageAnchorTransition = React.memo(
  function WorkspaceMessageAnchorTransition({
    presentation,
    currentUserUuid,
    usersById,
    errorDetail,
    onRetry,
    onTailNavigationRequested,
    resolveAuthorLabel,
    resolveMention,
  }: WorkspaceMessageAnchorTransitionProps): React.ReactElement {
    const [visibleSkeletons, setVisibleSkeletons] = useState({ intentId: 0, visible: false });
    const isFailed = presentation.phase === "failed";

    useEffect(() => {
      if (isFailed) return;
      const timeoutId = window.setTimeout(() => {
        setVisibleSkeletons({ intentId: presentation.intentId, visible: true });
      }, 100);
      return () => window.clearTimeout(timeoutId);
    }, [isFailed, presentation.intentId]);

    const showSkeletons =
      !isFailed && visibleSkeletons.intentId === presentation.intentId && visibleSkeletons.visible;
    const message = presentation.previewMessage;
    const previewItem =
      message == null
        ? null
        : createWorkspaceMessageListServerItem(
            message,
            `preview:${presentation.intentId}:${message.uuid}`,
          );
    const previewIsPeer =
      previewItem != null && !previewItem.isOwn && previewItem.authorUuid !== currentUserUuid;
    const animateSkeletons = !prefersReducedMotion();

    return (
      <div
        className={`relative flex min-h-0 flex-1 flex-col justify-center gap-4 overflow-hidden ${
          previewIsPeer ? "px-3 py-4" : "px-4 py-6"
        }`}
        aria-busy={!isFailed}
        data-message-anchor-transition="true"
      >
        {isFailed ? null : (
          <span className="sr-only" role="status" aria-live="polite">
            {t("chat.loadingMessageContext")}
          </span>
        )}
        <div className="flex min-h-24 flex-col justify-end gap-3" data-skeleton-area="top">
          {showSkeletons ? (
            <>
              <WorkspaceMessageBubbleSkeleton animated={animateSkeletons} />
              <WorkspaceMessageBubbleSkeleton align="end" animated={animateSkeletons} />
            </>
          ) : null}
        </div>
        <article
          className="flex justify-center"
          data-message-preview-uuid={presentation.messageUuid}
        >
          {previewItem == null ? (
            <div className="w-full max-w-2xl">
              {showSkeletons ? (
                <WorkspaceMessageBubbleSkeleton animated={animateSkeletons} />
              ) : (
                <div className="min-h-20" data-message-preview-placeholder="true" />
              )}
            </div>
          ) : (
            <WorkspaceMessageAnchorPreviewRow
              item={previewItem}
              currentUserUuid={currentUserUuid}
              usersById={usersById}
              resolveAuthorLabel={resolveAuthorLabel}
              resolveMention={resolveMention}
            />
          )}
        </article>
        <div className="flex min-h-24 flex-col gap-3" data-skeleton-area="bottom">
          {showSkeletons ? (
            <>
              <WorkspaceMessageBubbleSkeleton align="end" animated={animateSkeletons} />
              <WorkspaceMessageBubbleSkeleton animated={animateSkeletons} />
            </>
          ) : null}
        </div>
        {isFailed ? (
          <div
            className="absolute inset-x-4 bottom-4 z-base mx-auto flex max-w-2xl flex-col items-end gap-2"
            data-message-anchor-failed-actions="true"
          >
            <div
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2 text-sm text-notice-base shadow-lg"
              role="alert"
              data-message-anchor-error-overlay="true"
            >
              <span className="min-w-0">
                <span className="block font-medium">{t("chat.messageNavigationError")}</span>
                <span className="block text-xs">
                  {errorDetail ?? t("chat.messageNavigationUnavailable")}
                </span>
              </span>
              <button
                type="button"
                onClick={onRetry}
                className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-black"
              >
                {t("chat.retryMessageNavigation")}
              </button>
            </div>
            {onTailNavigationRequested != null ? (
              <FloatingScrollToBottomButton
                onClick={onTailNavigationRequested}
                unreadCount={0}
                inline
              />
            ) : null}
          </div>
        ) : null}
        {!isFailed && onTailNavigationRequested != null ? (
          <FloatingScrollToBottomButton onClick={onTailNavigationRequested} unreadCount={0} />
        ) : null}
      </div>
    );
  },
);
