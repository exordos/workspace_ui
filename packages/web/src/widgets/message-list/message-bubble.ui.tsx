import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { canStartMessageContentEdit } from "~/entities/message/message-edit-policy.lib";
import { useUsersStore } from "~/entities/user/user.model";
import { preflightExternalOperation } from "~/features/external-accounts/external-accounts.api";
import {
  EXTERNAL_CAPABILITY,
  type ExternalCapabilityName,
} from "~/features/external-accounts/external-capabilities.lib";
import { t } from "~/i18n/i18n";
import { fetchMessageReactions } from "~/shared/api/messenger-messages";
import { formatMessageTimeShort } from "~/shared/lib/datetime.lib";
import { getJitsiMeetingUrl, type JitsiLinkOptions } from "~/shared/lib/jitsi";
import { messageAuthorId } from "~/shared/lib/message-author.lib";
import { messageBodyToUnsanitizedDisplayHtml } from "~/shared/lib/message-markdown-display.lib";
import { prepareProtectedMessageHtml } from "~/shared/lib/protected-message-media";
import { useProtectedMessageHtml } from "~/shared/lib/protected-message-media.hook";
import { isIamUserUuid, numericUserIdOrNull, userIdsEqual } from "~/shared/lib/user-id.lib";
import { AccessibleAlertDialog } from "~/shared/ui/accessible-alert-dialog.ui";
import { filterVisibleContextSections } from "./message-bubble-actions.lib";
import {
  MessageBubbleStandardBody,
  resolveMessageEditStatusIndicatorNode,
  resolveOwnDeliveryIndicatorNode,
} from "./message-bubble-content.ui";
import { MessageBubbleContextMenu } from "./message-bubble-context-menu.ui";
import { BASE_CONTEXT_SECTIONS, JITSI_CONTEXT_SECTIONS } from "./message-bubble-context.lib";
import { resolveOwnMessageDeliveryStatus } from "./message-bubble-delivery.lib";
import { groupReactions } from "./message-bubble-emoji.lib";
import { useMessageBubbleInteractions } from "./message-bubble-interactions.hook";
import { MessageBubbleJitsiCard } from "./message-bubble-jitsi-card.ui";
import {
  MessageBubbleGroupedShell,
  MessageBubbleStandaloneShell,
} from "./message-bubble-layout.ui";
import { getMessageImagesBaseUrl } from "./message-bubble-realm-html.lib";
import { resolveJitsiLocationName } from "./message-jitsi-location.lib";
import { useMessageLinkPreview } from "./message-link-preview.hook";
import { MessageMentionPopover } from "./message-mention-popover.ui";
import type { MessageBubbleCallbacks, MessageBubbleProps } from "./message-bubble.types";

export type { MessageBubbleCallbacks, MessageBubbleProps } from "./message-bubble.types";

interface ExternalPreflightDialogProps {
  losses: readonly string[] | null;
  error: string | null;
  onConfirm: () => void;
  onDismiss: () => void;
}

const ExternalPreflightDialog: React.FC<ExternalPreflightDialogProps> = ({
  losses,
  error,
  onConfirm,
  onDismiss,
}) => {
  if (losses == null && error == null) return null;
  const label =
    losses == null
      ? t("message.externalOperationUnavailable")
      : t("message.externalOperationLossTitle");
  return (
    <AccessibleAlertDialog
      className="fixed inset-0 z-modal grid place-items-center bg-black/50 p-4"
      label={label}
      onDismiss={onDismiss}
      data-testid="external-operation-preflight-dialog"
    >
      <div className="w-full max-w-md rounded-xl border border-border-subtle bg-card-bg p-4 shadow-xl">
        <p className="text-sm font-semibold text-text-primary">{label}</p>
        {losses != null && (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-text-secondary">
            {losses.map((loss) => (
              <li key={loss}>{loss}</li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex gap-2">
          {losses != null && (
            <button
              type="button"
              className="min-h-11 rounded-lg bg-accent px-3 text-sm text-on-accent"
              onClick={onConfirm}
            >
              {t("message.externalOperationContinue")}
            </button>
          )}
          <button
            type="button"
            className="min-h-11 rounded-lg border border-border-subtle px-3 text-sm text-text-primary"
            onClick={onDismiss}
          >
            {losses == null ? t("common.close") : t("common.cancel")}
          </button>
        </div>
      </div>
    </AccessibleAlertDialog>
  );
};

export const MessageBubble: React.FC<MessageBubbleProps> = React.memo(
  ({
    message,
    isOwn = false,
    showAvatar = true,
    showSenderName = true,
    showTopicInSenderName = true,
    inSenderGroup = false,
    currentUserId,
    selectionMode = false,
    isSelected = false,
    isFocused = false,
    mediaGallery,
    customEmojis,
    onEmojiPickerOpen,
    resolveCustomEmojiImageUrl,
    resolveCustomEmojiShortcodeImageUrl,
    callbacks,
  }) => {
    const messageBodyRef = useRef<HTMLDivElement>(null);
    const linkPreviewVisibilityRef = useRef<HTMLDivElement>(null);
    const groupedContainerRef = useRef<HTMLDivElement>(null);
    const regularContainerRef = useRef<HTMLDivElement>(null);
    const [canEditMessageContentForMenu, setCanEditMessageContentForMenu] = useState(false);
    const [externalPreflightLosses, setExternalPreflightLosses] = useState<string[] | null>(null);
    const [externalPreflightError, setExternalPreflightError] = useState<string | null>(null);
    const [pendingExternalMutation, setPendingExternalMutation] = useState<(() => void) | null>(
      null,
    );

    const jitsiMeetBaseUrl = useInstancesStore((s) => s.jitsiMeetBaseUrl);
    const jitsiLinkOptions = useMemo<JitsiLinkOptions>(
      () => ({ serverBaseUrl: jitsiMeetBaseUrl }),
      [jitsiMeetBaseUrl],
    );
    const getUser = useUsersStore((s) => s.getUser);
    const authorId = isOwn && currentUserId != null ? currentUserId : messageAuthorId(message);
    const user = getUser(authorId);
    const findUserIdByDisplayName = useUsersStore((s) => s.findUserIdByDisplayName);
    const resolveUserMention = useCallback(
      (displayName: string): number | null =>
        numericUserIdOrNull(findUserIdByDisplayName(displayName)),
      [findUserIdByDisplayName],
    );
    const trimmedUserName = user?.full_name?.trim();
    const displayName =
      trimmedUserName != null && trimmedUserName.length > 0
        ? trimmedUserName
        : message.sender_full_name || (isOwn ? t("common.you") : "");
    const handleAuthorClick = useCallback(() => {
      callbacks?.onAuthorClick?.(authorId);
    }, [authorId, callbacks]);
    const handleToggleSelect = useCallback(() => {
      callbacks?.onToggleSelect?.(message);
    }, [callbacks, message]);

    const time = formatMessageTimeShort(message.timestamp);
    const reactionGroups = useMemo(
      () => groupReactions(message.reactions ?? {}, resolveCustomEmojiImageUrl),
      [message.reactions, resolveCustomEmojiImageUrl],
    );
    const reactionFingerprint = useMemo(
      () =>
        Object.entries(message.reactions ?? {})
          .filter(([, count]) => Number.isFinite(count) && count > 0)
          .map(([emojiName, count]) => `${emojiName}:${count}`)
          .sort()
          .join("|"),
      [message.reactions],
    );
    const [ownReactionEmojiNames, setOwnReactionEmojiNames] = useState<ReadonlySet<string>>(
      () => new Set(),
    );

    useEffect(() => {
      if (!isIamUserUuid(currentUserId) || reactionFingerprint.length === 0) {
        setOwnReactionEmojiNames(new Set());
        return;
      }
      const availableEmojiNames = new Set(reactionGroups.map((reaction) => reaction.emojiName));
      const controller = new AbortController();
      let cancelled = false;
      void fetchMessageReactions(message.id, {
        userUuid: currentUserId,
        signal: controller.signal,
      })
        .then((reactions) => {
          if (cancelled) {
            return;
          }
          const ownEmojiNames = new Set<string>();
          for (const reaction of reactions) {
            if (
              availableEmojiNames.has(reaction.emoji_name) &&
              userIdsEqual(reaction.user_uuid, currentUserId)
            ) {
              ownEmojiNames.add(reaction.emoji_name);
            }
          }
          setOwnReactionEmojiNames(ownEmojiNames);
        })
        .catch((error: unknown) => {
          if (cancelled || (error instanceof DOMException && error.name === "AbortError")) {
            return;
          }
          setOwnReactionEmojiNames(new Set());
        });
      return () => {
        cancelled = true;
        controller.abort();
      };
    }, [currentUserId, message.id, reactionFingerprint, reactionGroups]);

    const imagesBase = getMessageImagesBaseUrl();
    const { safeMessageHtml, displayHtmlForJitsi } = useMemo(() => {
      const displaySourceBody = message.markdown_source ?? message.content;
      const rawHtml = messageBodyToUnsanitizedDisplayHtml(displaySourceBody, {
        resolveUserMention,
        treatAsMarkdown: message.markdown_source != null,
        renderedContent: message.content,
      });
      return {
        safeMessageHtml: prepareProtectedMessageHtml(rawHtml, imagesBase, {
          resolveCustomEmojiShortcodeImageUrl,
        }),
        displayHtmlForJitsi: rawHtml,
      };
    }, [
      message.content,
      message.markdown_source,
      imagesBase,
      resolveUserMention,
      resolveCustomEmojiShortcodeImageUrl,
    ]);

    const jitsiUrl =
      getJitsiMeetingUrl(message.content, jitsiLinkOptions) ??
      getJitsiMeetingUrl(displayHtmlForJitsi, jitsiLinkOptions);
    const isJitsiCall = jitsiUrl != null;
    const jitsiLocationName = isJitsiCall ? resolveJitsiLocationName(message) : "";
    const handleBeforeMenuOpen = useCallback(() => {
      const { currentUserMessageEditPolicy } = useUsersStore.getState();
      setCanEditMessageContentForMenu(
        canStartMessageContentEdit(
          message,
          currentUserId ?? null,
          currentUserMessageEditPolicy,
          Math.floor(Date.now() / 1000),
        ),
      );
    }, [currentUserId, message]);

    const preflightExternalMutation = useCallback(
      (action: ExternalCapabilityName, execute: () => void) => {
        if (message.provider == null) {
          execute();
          return;
        }
        setExternalPreflightError(null);
        void preflightExternalOperation({
          externalAccountUuid: message.provider.accountUuid,
          action,
          target: { type: "message", uuid: String(message.id) },
        })
          .then((result) => {
            if (!result.ok || !result.value.allowed) {
              setExternalPreflightError(t("message.externalOperationUnavailable"));
              return;
            }
            if (!result.value.requiresConfirmation) {
              execute();
              return;
            }
            setPendingExternalMutation(() => execute);
            setExternalPreflightLosses(
              result.value.losses.map((loss) =>
                typeof loss.message === "string"
                  ? loss.message
                  : t("message.externalOperationLossFallback"),
              ),
            );
          })
          .catch(() => setExternalPreflightError(t("message.externalOperationUnavailable")));
      },
      [message.id, message.provider],
    );
    const effectiveCallbacks = useMemo(() => {
      if (message.provider == null) return callbacks;
      const editAvailable =
        message.provider.capabilities["messenger.message.edit"]?.available === true;
      const deleteAvailable =
        message.provider.capabilities["messenger.message.delete"]?.available === true;
      const reactionAvailable =
        message.provider.capabilities[EXTERNAL_CAPABILITY.reactionWrite]?.available === true;
      const onAddReaction: MessageBubbleCallbacks["onAddReaction"] =
        callbacks?.onAddReaction != null && reactionAvailable
          ? (messageId, payload) =>
              preflightExternalMutation(EXTERNAL_CAPABILITY.reactionWrite, () =>
                callbacks.onAddReaction?.(messageId, payload),
              )
          : undefined;
      const onRemoveReaction: MessageBubbleCallbacks["onRemoveReaction"] =
        callbacks?.onRemoveReaction != null && reactionAvailable
          ? (messageId, payload) =>
              preflightExternalMutation(EXTERNAL_CAPABILITY.reactionWrite, () =>
                callbacks.onRemoveReaction?.(messageId, payload),
              )
          : undefined;
      return {
        ...callbacks,
        onEdit:
          callbacks?.onEdit != null && editAvailable
            ? (target: typeof message) =>
                preflightExternalMutation("messenger.message.edit", () =>
                  callbacks.onEdit?.(target),
                )
            : undefined,
        onDelete:
          callbacks?.onDelete != null && deleteAvailable
            ? (target: typeof message) =>
                preflightExternalMutation("messenger.message.delete", () =>
                  callbacks.onDelete?.(target),
                )
            : undefined,
        onAddReaction,
        onRemoveReaction,
      };
    }, [callbacks, message, preflightExternalMutation]);

    const interactions = useMessageBubbleInteractions({
      message,
      messageContent: message.content,
      safeMessageHtml,
      inSenderGroup,
      jitsiUrl,
      jitsiLocationName,
      mediaGallery,
      callbacks: effectiveCallbacks,
      onEmojiPickerOpen,
      onBeforeMenuOpen: handleBeforeMenuOpen,
      messageBodyRef,
      linkPreviewVisibilityRef,
      groupedContainerRef,
      regularContainerRef,
    });

    useProtectedMessageHtml(messageBodyRef, safeMessageHtml, {
      deferRootSelector: '[role="feed"]',
    });

    const { visiblePreviews: linkPreviews } = useMessageLinkPreview(
      message,
      linkPreviewVisibilityRef,
    );

    const ownDeliveryStatus = isOwn ? resolveOwnMessageDeliveryStatus(message) : null;
    const deliveryStatusIndicator = resolveOwnDeliveryIndicatorNode(
      ownDeliveryStatus,
      message,
      callbacks,
    );
    const editStatusIndicator = isOwn
      ? resolveMessageEditStatusIndicatorNode(message, callbacks)
      : null;
    const localDeliveryIndicator = editStatusIndicator ?? deliveryStatusIndicator;
    const ownDeliveryIndicator = localDeliveryIndicator;
    const bubbleSurfaceClass = "rounded-[18px]";
    const focusedBubbleBackgroundClass = !isSelected && isFocused ? "bg-card-bg-active" : null;
    const ownBubbleBackgroundClass = focusedBubbleBackgroundClass ?? "bg-msg-own-bg";
    const peerBubbleBackgroundClass = focusedBubbleBackgroundClass ?? "bg-bg-elevated";
    const ownBubbleTailClass = "rounded-br-[6px]";
    const peerBubbleTailClass = "rounded-bl-[6px]";
    const hasReactions = reactionGroups.length > 0;
    const contextSections = isJitsiCall ? JITSI_CONTEXT_SECTIONS : BASE_CONTEXT_SECTIONS;
    const visibleContextSections = useMemo(
      () =>
        filterVisibleContextSections(contextSections, {
          isOwn,
          canEditMessageContent: canEditMessageContentForMenu,
          isJitsiCall,
          requireMutationCallbacks: message.provider != null,
          callbacks: effectiveCallbacks,
        }),
      [
        contextSections,
        isOwn,
        canEditMessageContentForMenu,
        isJitsiCall,
        message.provider,
        effectiveCallbacks,
      ],
    );

    const handleExternalPreflightDismiss = useCallback(() => {
      setPendingExternalMutation(null);
      setExternalPreflightLosses(null);
      setExternalPreflightError(null);
    }, []);
    const handleExternalPreflightConfirm = useCallback(() => {
      setPendingExternalMutation(null);
      setExternalPreflightLosses(null);
      pendingExternalMutation?.();
    }, [pendingExternalMutation]);

    const contextMenu = (
      <MessageBubbleContextMenu
        open={interactions.menuOpen}
        source={interactions.menuSource}
        contextAnchor={interactions.contextMenuAnchor}
        onSourceChange={interactions.handleContextMenuSourceChange}
        onOpenChange={interactions.handleContextMenuOpenChange}
        isOwn={isOwn}
        reactionEnabled={message.provider == null || effectiveCallbacks?.onAddReaction != null}
        emojiPickerOpen={interactions.emojiPickerOpen}
        onEmojiPickerOpenChange={interactions.handleEmojiPickerOpenChange}
        visibleContextSections={visibleContextSections}
        onMenuItem={interactions.handleMenuAction}
        onQuickReaction={interactions.handleQuickReaction}
        onEmojiPick={interactions.handleEmojiPick}
        customEmojis={customEmojis}
      />
    );

    const mentionPopoverPortal =
      interactions.mentionPopover != null && callbacks?.onOpenDirectMessage != null ? (
        <MessageMentionPopover
          userId={interactions.mentionPopover.userId}
          anchorRect={interactions.mentionPopover.anchorRect}
          fallbackName={interactions.mentionPopover.fallbackName}
          onClose={interactions.closeMentionPopover}
          onOpenDirectMessage={callbacks.onOpenDirectMessage}
          onOpenUserProfile={callbacks.onAuthorClick}
        />
      ) : null;

    const bubbleInner = isJitsiCall ? (
      <>
        <MessageBubbleJitsiCard
          message={message}
          jitsiUrl={jitsiUrl}
          jitsiLinkOptions={jitsiLinkOptions}
          isOwn={isOwn}
          time={time}
          ownDeliveryIndicator={ownDeliveryIndicator}
          bubbleSurfaceClass={bubbleSurfaceClass}
          ownBubbleTailClass={ownBubbleTailClass}
          peerBubbleTailClass={peerBubbleTailClass}
          callbacks={effectiveCallbacks}
        />
        {contextMenu}
      </>
    ) : (
      <>
        <MessageBubbleStandardBody
          message={message}
          isOwn={isOwn}
          time={time}
          hasReactions={hasReactions}
          reactionGroups={reactionGroups}
          ownReactionEmojiNames={ownReactionEmojiNames}
          callbacks={effectiveCallbacks}
          ownDeliveryIndicator={ownDeliveryIndicator}
          bubbleSurfaceClass={bubbleSurfaceClass}
          ownBubbleTailClass={ownBubbleTailClass}
          peerBubbleTailClass={peerBubbleTailClass}
          ownBubbleBackgroundClass={ownBubbleBackgroundClass}
          peerBubbleBackgroundClass={peerBubbleBackgroundClass}
          messageBodyRef={messageBodyRef}
          linkPreviewVisibilityRef={linkPreviewVisibilityRef}
          linkPreviews={linkPreviews}
        />
        {contextMenu}
      </>
    );

    const shellProps = {
      message,
      isOwn,
      isSelected,
      isFocused,
      selectionMode,
      showSenderName,
      showAvatar,
      showTopicInSenderName,
      inSenderGroup,
      displayName,
      user,
      bubbleSurfaceClass,
      onToggleSelect: handleToggleSelect,
      onAuthorClick: handleAuthorClick,
      onKeyDown: interactions.handleKeyboardContextMenu,
      children: bubbleInner,
    };

    const externalPreflightDialog = (
      <ExternalPreflightDialog
        losses={externalPreflightLosses}
        error={externalPreflightError}
        onConfirm={handleExternalPreflightConfirm}
        onDismiss={handleExternalPreflightDismiss}
      />
    );

    if (inSenderGroup) {
      return (
        <>
          <MessageBubbleGroupedShell {...shellProps} containerRef={groupedContainerRef} />
          {mentionPopoverPortal}
          {externalPreflightDialog}
        </>
      );
    }

    return (
      <>
        <MessageBubbleStandaloneShell {...shellProps} containerRef={regularContainerRef} />
        {mentionPopoverPortal}
        {externalPreflightDialog}
      </>
    );
  },
);
