import React from "react";
import { formatUserStatusLabel } from "~/entities/user/user-status.lib";
import type { UserRecord } from "~/entities/user/user.model";
import { t } from "~/i18n/i18n";
import type { MockMessage } from "~/shared/api/zulip.types";
import { getPresenceState } from "~/shared/lib/format";
import { Avatar } from "~/shared/ui/avatar";
import { Icon } from "~/shared/ui/icon";
import { PresenceIndicator } from "~/shared/ui/presence-indicator";
import { resolveAvatarSrc } from "./message-avatar.lib";

interface MessageBubbleSenderMetaProps {
  displayName: string;
  senderStatusLabel: string | null;
  showTopicInSenderName: boolean;
  subject: string | undefined;
  isOwn: boolean;
}

export const MessageBubbleSenderMeta = React.memo<MessageBubbleSenderMetaProps>(
  function MessageBubbleSenderMeta({
    displayName,
    senderStatusLabel,
    showTopicInSenderName,
    subject,
    isOwn,
  }) {
    return (
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-sm font-semibold text-text-primary">{displayName}</span>
        {senderStatusLabel != null && senderStatusLabel.length > 0 && (
          <span className="truncate text-[11px] text-text-secondary">{senderStatusLabel}</span>
        )}
        {showTopicInSenderName && subject != null && subject.length > 0 && (
          <span
            className={`text-[11px] font-medium ${isOwn ? "text-call-green" : "text-accent-soft"}`}
          >
            {subject}
          </span>
        )}
      </div>
    );
  },
);

interface MessageBubbleSelectionControlProps {
  isSelected: boolean;
  onToggle: () => void;
  className?: string;
}

export const MessageBubbleSelectionControl = React.memo<MessageBubbleSelectionControlProps>(
  function MessageBubbleSelectionControl({ isSelected, onToggle, className = "" }) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border border-border-subtle transition-colors ${className}`}
        aria-label={isSelected ? t("message.deselect") : t("message.select")}
      >
        {isSelected && <Icon name="check" size={14} className="text-accent" />}
      </button>
    );
  },
);

interface MessageBubblePeerAvatarProps {
  displayName: string;
  avatarSrc: string | undefined;
  presenceState: ReturnType<typeof getPresenceState>;
  onAuthorClick: () => void;
}

export const MessageBubblePeerAvatar = React.memo<MessageBubblePeerAvatarProps>(
  function MessageBubblePeerAvatar({ displayName, avatarSrc, presenceState, onAuthorClick }) {
    return (
      <button
        type="button"
        onClick={onAuthorClick}
        className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
        aria-label={t("a11y.openUserProfile", { name: displayName })}
      >
        <span className="relative block">
          <Avatar
            size="lg"
            className="flex-shrink-0 bg-bg-elevated text-accent-soft"
            src={avatarSrc}
            imageLoading="lazy"
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
    );
  },
);

export interface MessageBubbleShellProps {
  message: MockMessage;
  isOwn: boolean;
  isSelected: boolean;
  isFocused: boolean;
  selectionMode: boolean;
  showSenderName: boolean;
  showAvatar: boolean;
  showTopicInSenderName: boolean;
  inSenderGroup: boolean;
  displayName: string;
  user: UserRecord | undefined;
  bubbleSurfaceClass: string;
  onToggleSelect: () => void;
  onAuthorClick: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}

export const MessageBubbleGroupedShell = React.memo<MessageBubbleShellProps>(
  function MessageBubbleGroupedShell({
    message,
    isOwn,
    isSelected,
    isFocused,
    selectionMode,
    showSenderName,
    showTopicInSenderName,
    displayName,
    user,
    bubbleSurfaceClass,
    onToggleSelect,
    onKeyDown,
    containerRef,
    children,
  }) {
    const senderStatusLabel = !isOwn ? formatUserStatusLabel(user?.status) : null;

    return (
      <div
        ref={containerRef}
        data-message-id={message.id}
        data-testid={`message-${message.id}`}
        data-focused={isFocused ? "true" : "false"}
        role="button"
        tabIndex={0}
        onKeyDown={onKeyDown}
        className={`selectable group relative flex items-start gap-2 py-2 transition-colors duration-500 ${
          !isSelected ? "hover:bg-bg-elevated/30" : ""
        } ${isSelected ? "bg-msg-selected" : ""}`}
      >
        {selectionMode ? (
          <MessageBubbleSelectionControl isSelected={isSelected} onToggle={onToggleSelect} />
        ) : null}
        <div className={`min-w-0 flex-1 ${isOwn ? "flex flex-col items-end" : ""}`}>
          {showSenderName ? (
            <MessageBubbleSenderMeta
              displayName={displayName}
              senderStatusLabel={senderStatusLabel}
              showTopicInSenderName={showTopicInSenderName}
              subject={message.subject}
              isOwn={isOwn}
            />
          ) : null}
          <div
            className={`relative min-w-0 max-w-[85%] text-sm leading-relaxed ${bubbleSurfaceClass} ${
              showSenderName ? "mt-1" : "mt-0.5"
            } ${isOwn ? "flex flex-col items-end" : ""}`}
          >
            {children}
          </div>
        </div>
      </div>
    );
  },
);

export const MessageBubbleStandaloneShell = React.memo<MessageBubbleShellProps>(
  function MessageBubbleStandaloneShell({
    message,
    isOwn,
    isSelected,
    isFocused,
    selectionMode,
    showSenderName,
    showAvatar,
    showTopicInSenderName,
    displayName,
    user,
    bubbleSurfaceClass,
    onToggleSelect,
    onAuthorClick,
    onKeyDown,
    containerRef,
    children,
  }) {
    const senderStatusLabel = !isOwn ? formatUserStatusLabel(user?.status) : null;
    const avatarSrc = resolveAvatarSrc(user?.avatar_url ?? undefined);
    const presenceState =
      user?.presence != null
        ? getPresenceState(user.presence.timestamp, user.presence.status)
        : null;

    return (
      <div
        ref={containerRef}
        data-message-id={message.id}
        data-testid={`message-${message.id}`}
        data-focused={isFocused ? "true" : "false"}
        role="button"
        tabIndex={0}
        onKeyDown={onKeyDown}
        className={`selectable group relative flex gap-2 px-4 py-2 transition-colors duration-500 ${
          isOwn ? "flex-row-reverse" : ""
        } ${!isSelected ? "hover:bg-bg-elevated/30" : ""} ${isSelected ? "bg-msg-selected" : ""}`}
      >
        {selectionMode ? (
          <MessageBubbleSelectionControl
            isSelected={isSelected}
            onToggle={onToggleSelect}
            className="self-center"
          />
        ) : null}
        {!isOwn &&
          (showAvatar ? (
            <MessageBubblePeerAvatar
              displayName={displayName}
              avatarSrc={avatarSrc ?? undefined}
              presenceState={presenceState}
              onAuthorClick={onAuthorClick}
            />
          ) : (
            <div className="w-12 flex-shrink-0" aria-hidden />
          ))}
        {isOwn ? <div className="w-12 flex-shrink-0" /> : null}
        <div className={`min-w-0 flex-1 ${isOwn ? "flex flex-col items-end" : ""}`}>
          {showSenderName ? (
            <MessageBubbleSenderMeta
              displayName={displayName}
              senderStatusLabel={senderStatusLabel}
              showTopicInSenderName={showTopicInSenderName}
              subject={message.subject}
              isOwn={isOwn}
            />
          ) : null}
          <div
            className={`relative min-w-0 max-w-[85%] text-sm leading-relaxed ${bubbleSurfaceClass} ${
              showSenderName ? "mt-1" : "mt-0.5"
            } ${isOwn ? "flex flex-col items-end" : ""}`}
          >
            {children}
          </div>
        </div>
      </div>
    );
  },
);
