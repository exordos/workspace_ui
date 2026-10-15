import type { UserPickerId, UserPickerOption } from "~/shared/lib/user-picker";

export interface UserPickerListProps<TId extends UserPickerId = UserPickerId> {
  options: readonly UserPickerOption<TId>[];
  selectedUserIds: ReadonlySet<TId>;
  onToggle: (userId: TId) => void;
  query: string;
  onQueryChange: (query: string) => void;
  queryPlaceholder?: string;
  emptyLabel?: string;
  inputClassName?: string;
  listClassName?: string;
  className?: string;
  rowClassName?: string;
}
