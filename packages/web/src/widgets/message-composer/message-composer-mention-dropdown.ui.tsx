import React from "react";
import { t } from "~/i18n/i18n";
import { getRealmBaseUrl } from "~/shared/api/zulip-client.internal";
import { resolveAvatarUrl } from "~/shared/lib/avatar";
import { Avatar } from "~/shared/ui/avatar";
import type { ComposerMentionDropdownProps } from "./message-composer-mention-dropdown.types";

export const ComposerMentionDropdown = React.memo(function ComposerMentionDropdown({
  suggestions,
  activeIndex,
  onSelect,
  onHoverIndex,
}: ComposerMentionDropdownProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const itemRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const realmBaseUrl = getRealmBaseUrl();

  React.useEffect(() => {
    if (suggestions.length === 0) return;
    const container = containerRef.current;
    const activeItem = itemRefs.current[activeIndex];
    if (container == null || activeItem == null || !container.contains(activeItem)) return;
    if (typeof activeItem.scrollIntoView !== "function") return;
    activeItem.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
  }, [activeIndex, suggestions]);

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full left-0 z-dropdown mb-1 max-h-48 w-80 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg border border-border-subtle bg-bg-elevated shadow-xl"
    >
      {suggestions.length > 0 ? (
        suggestions.map((user, index) => {
          const avatarSrc = resolveAvatarUrl(user.avatarUrl, realmBaseUrl);
          return (
            <button
              type="button"
              key={user.userUuid}
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
                </span>
                {user.email ? (
                  <span className="block truncate text-[11px] text-text-secondary">
                    {user.email}
                  </span>
                ) : null}
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
