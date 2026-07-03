import type { UserPickerId, UserPickerOption } from "~/shared/lib/user-picker";

export interface UserPickerListProps {
  options: readonly UserPickerOption[];
  selectedUserIds: ReadonlySet<UserPickerId>;
  onToggle: (userId: UserPickerId) => void;
  query: string;
  onQueryChange: (query: string) => void;
  queryPlaceholder?: string;
  emptyLabel?: string;
  inputClassName?: string;
  listClassName?: string;
}
