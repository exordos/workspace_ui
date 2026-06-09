import React, { useCallback, useMemo, useRef } from "react";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useUsersStore } from "~/entities/user/user.model";
import { formatMessageTimeShort } from "~/shared/lib/datetime.lib";
import { getJitsiMeetingUrl, type JitsiLinkOptions } from "~/shared/lib/jitsi";
import { messageBodyToUnsanitizedDisplayHtml } from "~/shared/lib/message-markdown-display.lib";
import { prepareProtectedMessageHtml } from "~/shared/lib/protected-message-media";
import { useProtectedMessageHtml } from "~/shared/lib/protected-message-media.hook";
import { filterVisibleContextSections } from "./message-bubble-actions.lib";
import {
  MessageBubbleStandardBody,
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
import type { MessageBubbleProps } from "./message-bubble.types";

export type { MessageBubbleCallbacks, MessageBubbleProps } from "./message-bubble.types";

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

    const jitsiMeetBaseUrl = useInstancesStore((s) => s.jitsiMeetBaseUrl);
    const jitsiLinkOptions = useMemo<JitsiLinkOptions>(
      () => ({ serverBaseUrl: jitsiMeetBaseUrl }),
      [jitsiMeetBaseUrl],
    );
    const getUser = useUsersStore((s) => s.getUser);
    const user = getUser(message.sender_id);
    const findUserIdByDisplayName = useUsersStore((s) => s.findUserIdByDisplayName);
    const resolveUserMention = useCallback(
      (displayName: string): number | null => findUserIdByDisplayName(displayName),
      [findUserIdByDisplayName],
    );
    const trimmedUserName = user?.full_name?.trim();
    const displayName =
      trimmedUserName != null && trimmedUserName.length > 0
        ? trimmedUserName
        : (message.sender_full_name ?? "");
    const handleAuthorClick = useCallback(() => {
      callbacks?.onAuthorClick?.(message.sender_id);
    }, [callbacks, message.sender_id]);
    const handleToggleSelect = useCallback(() => {
      callbacks?.onToggleSelect?.(message);
    }, [callbacks, message]);

    const time = formatMessageTimeShort(message.timestamp);
    const reactionGroups = useMemo(
      () =>
        message.reactions?.length
          ? groupReactions(message.reactions, resolveCustomEmojiImageUrl)
          : [],
      [message.reactions, resolveCustomEmojiImageUrl],
    );
    const resolveReactionAuthorLabel = useCallback(
      (userId: number): string => {
        const reactionUser = getUser(userId);
        const fullName = reactionUser?.full_name?.trim();
        return fullName != null && fullName.length > 0 ? fullName : `#${userId}`;
      },
      [getUser],
    );
    const imagesBase = getMessageImagesBaseUrl();
    const { safeMessageHtml, displayHtmlForJitsi } = useMemo(() => {
      const displaySourceBody = message.markdown_source ?? message.content;
      const rawHtml = messageBodyToUnsanitizedDisplayHtml(displaySourceBody, {
        resolveUserMention,
        treatAsMarkdown: message.markdown_source != null,
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

    const interactions = useMessageBubbleInteractions({
      message,
      messageContent: message.content,
      safeMessageHtml,
      inSenderGroup,
      jitsiUrl,
      jitsiLocationName,
      mediaGallery,
      callbacks,
      onEmojiPickerOpen,
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
    const ownDeliveryIndicator = resolveOwnDeliveryIndicatorNode(
      ownDeliveryStatus,
      message,
      callbacks,
    );
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
          isJitsiCall,
          callbacks,
        }),
      [contextSections, isOwn, isJitsiCall, callbacks],
    );

    const contextMenu = (
      <MessageBubbleContextMenu
        open={interactions.menuOpen}
        source={interactions.menuSource}
        contextAnchor={interactions.contextMenuAnchor}
        onSourceChange={interactions.handleContextMenuSourceChange}
        onOpenChange={interactions.handleContextMenuOpenChange}
        isOwn={isOwn}
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
          callbacks={callbacks}
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
          currentUserId={currentUserId}
          resolveReactionAuthorLabel={resolveReactionAuthorLabel}
          callbacks={callbacks}
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

    if (inSenderGroup) {
      return (
        <>
          <MessageBubbleGroupedShell {...shellProps} containerRef={groupedContainerRef} />
          {mentionPopoverPortal}
        </>
      );
    }

    return (
      <>
        <MessageBubbleStandaloneShell {...shellProps} containerRef={regularContainerRef} />
        {mentionPopoverPortal}
      </>
    );
  },
);
