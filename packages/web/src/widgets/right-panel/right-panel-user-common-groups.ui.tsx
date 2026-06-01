import React, { useCallback } from "react";
import { t } from "~/i18n/i18n";
import { Avatar } from "~/shared/ui/avatar";
import { Icon } from "~/shared/ui/icon";
import type { RightPanelUserInfo } from "./right-panel.types";

const CommonGroupRow = React.memo(function CommonGroupRow({
  group,
  onSelect,
}: {
  group: NonNullable<RightPanelUserInfo["commonGroups"]>[number];
  onSelect: (slug: string) => void;
}) {
  const handleClick = useCallback(() => {
    if (group.slug != null) onSelect(group.slug);
  }, [group.slug, onSelect]);

  return (
    <li>
      <button
        type="button"
        className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
        onClick={handleClick}
      >
        <Avatar size="sm" className="bg-bg-elevated text-text-primary">
          {group.name.slice(0, 1)}
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-primary">{group.name}</p>
          {group.lastMessage && (
            <p className="truncate text-[11px] text-text-secondary">{group.lastMessage}</p>
          )}
        </div>
        {group.unread != null && group.unread > 0 && (
          <span className="flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full bg-badge-bg text-[11px] font-medium text-on-accent">
            {group.unread}
          </span>
        )}
        <Icon name="chevron-down" size={16} className="shrink-0 text-icon-base" />
      </button>
    </li>
  );
});

export const RightPanelUserCommonGroups = React.memo(function RightPanelUserCommonGroups({
  groups,
  onSelectCommonGroup,
}: {
  groups: NonNullable<RightPanelUserInfo["commonGroups"]>;
  onSelectCommonGroup?: (slug: string) => void;
}) {
  const handleSelect = useCallback(
    (slug: string) => {
      onSelectCommonGroup?.(slug);
    },
    [onSelectCommonGroup],
  );

  if (groups.length === 0) return null;

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
        {t("info.commonGroups")}
      </h3>
      <ul className="space-y-2">
        {groups.map((group, i) => (
          <CommonGroupRow key={group.slug ?? i} group={group} onSelect={handleSelect} />
        ))}
      </ul>
    </div>
  );
});
