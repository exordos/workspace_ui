import { useMemo } from "react";
import { t } from "~/i18n/i18n";
import { userPickerSearchText } from "~/shared/lib/user-picker";
import type { UserPickerId } from "~/shared/lib/user-picker";
import { PresenceIndicator } from "~/shared/ui/presence-indicator";
import { SearchableCheckboxList } from "~/shared/ui/searchable-checkbox-list";
import type { UserPickerListProps } from "./user-picker-list.types";

const DEFAULT_INPUT_CLASS =
  "w-full rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted transition-colors focus:border-accent focus-visible:outline-none focus-visible:ring-0";

export function UserPickerList<TId extends UserPickerId>({
  options,
  selectedUserIds,
  onToggle,
  query,
  onQueryChange,
  queryPlaceholder,
  emptyLabel,
  inputClassName = DEFAULT_INPUT_CLASS,
  listClassName = "h-96 overflow-y-auto rounded-lg border border-border-subtle",
  className,
  rowClassName,
}: Readonly<UserPickerListProps<TId>>) {
  const checkboxOptions = useMemo(
    () =>
      options.map((option) => ({
        value: option.userId,
        searchText: userPickerSearchText(option),
        disabled: option.isDisabled,
        label: (
          <>
            <PresenceIndicator status={option.presence} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{option.fullName}</span>
              {(option.statusLabel ?? option.email) && (
                <span className="block truncate text-[11px] text-text-secondary">
                  {option.statusLabel ?? option.email}
                </span>
              )}
            </span>
          </>
        ),
      })),
    [options],
  );

  return (
    <SearchableCheckboxList
      options={checkboxOptions}
      selectedValues={selectedUserIds}
      onToggle={onToggle}
      query={query}
      onQueryChange={onQueryChange}
      queryPlaceholder={queryPlaceholder ?? t("message.searchUsers")}
      emptyLabel={emptyLabel ?? t("search.noResults")}
      inputClassName={inputClassName}
      listClassName={listClassName}
      className={className}
      rowClassName={rowClassName}
    />
  );
}
