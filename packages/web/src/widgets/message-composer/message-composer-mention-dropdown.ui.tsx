import React from "react";
import { formatUserStatusLabel } from "~/entities/user/user-status.lib";
import { useUsersStore } from "~/entities/user/user.model";
import { t } from "~/i18n/i18n";
import { getRealmBaseUrl } from "~/shared/api/zulip";
import { resolveAvatarUrl } from "~/shared/lib/avatar";
import { getPresenceState } from "~/shared/lib/format";
import { Avatar } from "~/shared/ui/avatar";
import { PresenceIndicator } from "~/shared/ui/presence-indicator";
import type { ComposerMentionDropdownProps } from "./message-composer-mention-dropdown.types";

export const ComposerMentionDropdown = React.memo(function ComposerMentionDropdown({
  suggestions,
  activeIndex,
  onSelect,
  onHoverIndex,
}: ComposerMentionDropdownProps) {
  const getUser = useUsersStore((s) => s.getUser);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const itemRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const realmBaseUrl = getRealmBaseUrl();

  React.useEffect(() => {
    if (suggestions.length === 0) return;
    const container = containerRef.current;
    const activeItem = itemRefs.current[activeIndex];
    if (container == null || activeItem == null || !container.contains(activeItem)) return;
    if (typeof activeItem.scrollIntoView !== "function") return;
    activeItem.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeIndex, suggestions]);

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full left-0 z-dropdown mb-1 max-h-48 w-80 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg border border-border-subtle bg-bg-elevated shadow-xl"
    >
      {suggestions.length > 0 ? (
        suggestions.map((user, index) => {
          const u = getUser(user.userId);
          const presenceState =
            u?.presence != null ? getPresenceState(u.presence.timestamp, u.presence.status) : null;
          const statusLabel = formatUserStatusLabel(u?.status);
          const avatarSrc = resolveAvatarUrl(user.avatarUrl, realmBaseUrl);
          return (
            <button
              type="button"
              key={user.userId}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg ${
                activeIndex === index ? "bg-bg" : ""
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(user);
              }}
              onMouseEnter={() => onHoverIndex(index)}
            >
              <Avatar size="sm" src={avatarSrc} className="bg-bg text-text-primary">
                {user.fullName.slice(0, 1)}
              </Avatar>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate font-medium">{user.fullName}</span>
                  <PresenceIndicator
                    status={presenceState}
                    size="sm"
                    tone="header"
                    pulse={false}
                    withBorder={false}
                  />
                </span>
                {(statusLabel ?? user.email) && (
                  <span className="block truncate text-[11px] text-text-secondary">
                    {statusLabel ?? user.email}
                  </span>
                )}
              </span>
            </button>
          );
        })
      ) : (
        <div className="px-3 py-2 text-sm text-text-muted">{t("search.noResults")}</div>
      )}
    </div>
  );
});
