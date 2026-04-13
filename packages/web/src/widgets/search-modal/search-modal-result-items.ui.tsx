import React from "react";
import { formatUserStatusLabel } from "~/entities/user/user-status.lib";
import { useUsersStore } from "~/entities/user/user.model";
import { t } from "~/i18n/i18n";
import type { MockMessage } from "~/shared/api/zulip.types";
import { getPresenceState } from "~/shared/lib/format";
import { plainTextPreviewFromMessageBody } from "~/shared/lib/message-markdown-display.lib";
import { Icon } from "~/shared/ui/icon";
import { PresenceIndicator } from "~/shared/ui/presence-indicator";

export const MAX_USER_RESULTS = 20;

export const SearchResultItem = React.memo(function SearchResultItem({
  msg,
  onSelect,
}: {
  msg: MockMessage;
  onSelect: () => void;
}) {
  const senderName = useUsersStore((s) => s.getDisplayName(msg.sender_id));
  const displayName = senderName !== "Unknown" ? senderName : msg.sender_full_name;
  return (
    <li>
      <div className="hover:bg-bg/60 group flex items-start gap-2 rounded-lg px-3 py-2 transition-colors">
        <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left text-sm">
          <div className="mb-0.5 flex items-center gap-2 text-[11px] text-text-muted">
            <span>{displayName}</span>
            <span>·</span>
            <span>
              #{msg.channel ?? "?"} › #{msg.subject}
            </span>
          </div>
          <p className="line-clamp-2 truncate text-text-primary">
            {plainTextPreviewFromMessageBody(msg.content)}
          </p>
        </button>
        <button
          type="button"
          onClick={onSelect}
          className="hover:bg-bg-elevated/70 mt-0.5 rounded p-1 text-text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-text-primary"
          aria-label={t("message.openInChat")}
          title={t("message.openInChat")}
        >
          <Icon name="newWindow" size={16} className="text-current" />
        </button>
      </div>
    </li>
  );
});

export const UserResultItem = React.memo(function UserResultItem({
  userId,
  fullName,
  email,
  statusLabel,
  presenceState,
  onSelect,
}: {
  userId: number;
  fullName: string;
  email?: string;
  statusLabel?: string;
  presenceState: "active" | "idle" | "offline" | null;
  onSelect: () => void;
}) {
  const secondaryText = statusLabel ?? email ?? "";
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="hover:bg-bg/60 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors"
        aria-label={`${fullName} (${email ?? userId})`}
      >
        <PresenceIndicator status={presenceState} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-text-primary">{fullName}</span>
          {secondaryText.length > 0 && (
            <span className="block truncate text-[11px] text-text-secondary">{secondaryText}</span>
          )}
        </span>
        <span className="ml-2 shrink-0 text-[11px] text-text-muted">#{userId}</span>
      </button>
    </li>
  );
});
