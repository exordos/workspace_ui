import React, { useCallback } from "react";
import { useUsersStore } from "~/entities/user/user.model";
import { t } from "~/i18n/i18n";
import { getPresenceState } from "~/shared/lib/format";
import { Avatar } from "~/shared/ui/avatar";
import { PresenceIndicator } from "~/shared/ui/presence-indicator";
import { resolveAvatarSrc } from "./message-avatar.lib";
import { MessageBubble } from "./message-bubble.ui";
import type { MessageListSenderGroupProps } from "./message-list.types";

/** Group of messages from the same sender: single avatar at the bottom edge of the block. */
export const MessageListSenderGroup = React.memo<MessageListSenderGroupProps>(
  function MessageListSenderGroup({
    messages,
    currentUserId,
    bubbleCallbacks,
    selectionMode,
    selectedMessageIds,
    focusedMessageId,
    mediaGallery,
  }) {
    const user = useUsersStore((s) => s.getUser(messages[0]!.sender_id));
    const trimmedUserName = user?.full_name?.trim();
    const displayName =
      trimmedUserName != null && trimmedUserName.length > 0
        ? trimmedUserName
        : (messages[0]!.sender_full_name ?? "");
    const avatarSrc = resolveAvatarSrc(user?.avatar_url ?? undefined);
    const presenceState =
      user?.presence != null
        ? getPresenceState(user.presence.timestamp, user.presence.status)
        : null;
    const authorId = messages[0]!.sender_id;
    const handleAuthorClick = useCallback(() => {
      bubbleCallbacks?.onAuthorClick?.(authorId);
    }, [bubbleCallbacks, authorId]);

    return (
      <>
        <div className="flex items-stretch gap-2 px-4">
          <div className="flex w-12 flex-shrink-0 flex-col justify-end pb-2">
            <button
              type="button"
              onClick={handleAuthorClick}
              className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
              aria-label={t("a11y.openUserProfile", { name: displayName })}
            >
              <span className="relative block">
                <Avatar
                  size="lg"
                  className="bg-bg-elevated text-accent-soft"
                  src={avatarSrc ?? undefined}
                >
                  {displayName.slice(0, 1)}
                </Avatar>
                <PresenceIndicator
                  status={presenceState}
                  size="sm"
                  className="absolute bottom-0 right-0"
                />
              </span>
            </button>
          </div>
          <div className="min-w-0 flex-1">
            {messages.map((m, i) => (
              <MessageBubble
                key={m.local_echo_key ?? m.id}
                message={m}
                isOwn={false}
                showSenderName={i === 0}
                inSenderGroup
                currentUserId={currentUserId}
                callbacks={bubbleCallbacks}
                selectionMode={selectionMode}
                isSelected={selectedMessageIds?.has(m.id)}
                isFocused={focusedMessageId === m.id}
                mediaGallery={mediaGallery}
              />
            ))}
          </div>
        </div>
      </>
    );
  },
);
