import React from "react";
import { resolveUserPresenceVisual } from "~/entities/user/user-selectors.lib";
import { WorkspaceAvatar } from "~/features/workspace-avatar/workspace-avatar.ui";
import { t } from "~/i18n/i18n";
import { PresenceIndicator } from "~/shared/ui/presence-indicator";
import { getWorkspaceComposerReferenceLabel } from "./message-composer-reference.lib";
import type { ComposerMentionDropdownProps } from "./message-composer-mention-dropdown.types";

export const ComposerMentionDropdown = React.memo(function ComposerMentionDropdown({
  suggestions,
  activeIndex,
  listboxId,
  onSelect,
  onHoverIndex,
}: ComposerMentionDropdownProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const itemRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

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
      id={listboxId}
      role="listbox"
      className="absolute bottom-full left-0 z-dropdown mb-1 max-h-48 w-80 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg border border-border-subtle bg-bg-elevated shadow-xl"
    >
      {suggestions.length > 0 ? (
        suggestions.map((suggestion, index) => {
          if ("kind" in suggestion) {
            const label = getWorkspaceComposerReferenceLabel(suggestion);
            const secondaryText = suggestion.kind === "topic" ? suggestion.topicName : "";
            return (
              <button
                type="button"
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={activeIndex === index}
                key={`${suggestion.kind}:${suggestion.kind === "stream" ? suggestion.streamUuid : suggestion.topicUuid}`}
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-primary transition-colors hover:bg-bg ${
                  activeIndex === index ? "bg-bg" : ""
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(suggestion);
                }}
                onMouseEnter={() => onHoverIndex(index)}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-bg text-xs text-text-secondary">
                  {suggestion.kind === "stream" ? "#" : "›"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{label}</span>
                  {secondaryText ? (
                    <span className="block truncate text-[11px] text-text-secondary">
                      {secondaryText}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          }

          const user = suggestion;
          const initials = user.displayName.slice(0, 1) || user.username.slice(0, 1) || "?";
          const secondaryText = user.username ? `@${user.username}` : user.email;
          const presence = resolveUserPresenceVisual(user.status);
          return (
            <button
              type="button"
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={activeIndex === index}
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
              <span className="relative flex shrink-0">
                <WorkspaceAvatar
                  size="sm"
                  avatarUrn={user.avatarUrl}
                  className="bg-bg text-text-primary"
                >
                  {initials}
                </WorkspaceAvatar>
                <PresenceIndicator
                  status={presence}
                  size="sm"
                  className="absolute -bottom-0.5 -right-0.5"
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate font-medium">{user.displayName}</span>
                </span>
                {secondaryText ? (
                  <span className="block truncate text-[11px] text-text-secondary">
                    {secondaryText}
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
