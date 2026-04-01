import React from "react";
import { useUsersStore } from "~/entities/user/user.model";
import { formatUserStatusLabel } from "~/entities/user/user-status.lib";
import { t } from "~/i18n/i18n";
import { getPresenceState } from "~/shared/lib/format";
import { PresenceIndicator } from "~/shared/ui/presence-indicator";
import type { ComposerMentionDropdownProps } from "./message-composer-mention-dropdown.types";

export const ComposerMentionDropdown = React.memo(function ComposerMentionDropdown({
  suggestions,
  activeIndex,
  onSelect,
  onHoverIndex,
}: ComposerMentionDropdownProps) {
  const getUser = useUsersStore((s) => s.getUser);

  return (
    <div className="absolute bottom-full left-0 z-dropdown mb-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border-subtle bg-bg-elevated shadow-xl">
      {suggestions.length > 0 ? (
        suggestions.map((user, index) => {
          const u = getUser(user.userId);
          const presence = u?.presence;
          const statusLabel = formatUserStatusLabel(u?.status);
          const presenceState =
            presence != null ? getPresenceState(presence.timestamp, presence.status) : null;
          return (
            <button
              type="button"
              key={user.userId}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg ${
                activeIndex === index ? "bg-bg" : ""
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(user);
              }}
              onMouseEnter={() => onHoverIndex(index)}
            >
              <PresenceIndicator status={presenceState} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{user.fullName}</span>
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
