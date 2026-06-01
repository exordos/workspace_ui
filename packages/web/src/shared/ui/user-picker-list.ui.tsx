import React from "react";
import { t } from "~/i18n/i18n";
import { PresenceIndicator } from "~/shared/ui/presence-indicator";
import type { UserPickerListProps } from "./user-picker-list.types";

const DEFAULT_INPUT_CLASS =
  "w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted transition-colors focus:border-accent focus-visible:outline-none focus-visible:ring-0";

export const UserPickerList: React.FC<UserPickerListProps> = ({
  options,
  selectedUserIds,
  onToggle,
  query,
  onQueryChange,
  queryPlaceholder,
  emptyLabel,
  inputClassName = DEFAULT_INPUT_CLASS,
  listClassName = "h-96 overflow-y-auto rounded-lg border border-border-subtle",
}) => {
  return (
    <div className="flex flex-1 flex-col gap-3 overflow-hidden">
      <input
        type="text"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        className={inputClassName}
        placeholder={queryPlaceholder ?? t("message.searchUsers")}
      />
      <div className={listClassName}>
        {options.length === 0 ? (
          <p className="px-3 py-4 text-center text-sm text-text-muted">
            {emptyLabel ?? t("search.noResults")}
          </p>
        ) : (
          options.map((option) => (
            <label
              key={option.userId}
              className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-text-primary transition-colors hover:bg-bg"
            >
              <input
                type="checkbox"
                checked={selectedUserIds.has(option.userId)}
                onChange={() => onToggle(option.userId)}
                className="h-4 w-4 rounded border-border-subtle"
                disabled={option.isDisabled}
              />
              <PresenceIndicator status={option.presence} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{option.fullName}</span>
                {(option.statusLabel ?? option.email) && (
                  <span className="block truncate text-[11px] text-text-secondary">
                    {option.statusLabel ?? option.email}
                  </span>
                )}
              </span>
            </label>
          ))
        )}
      </div>
    </div>
  );
};
