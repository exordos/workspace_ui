import type { UserId } from "~/shared/lib/user-id.lib";
import type { UserPickerOption } from "~/shared/lib/user-picker";

export interface UserPickerListProps {
  options: readonly UserPickerOption[];
  selectedUserIds: ReadonlySet<UserId>;
  onToggle: (userId: UserId) => void;
  query: string;
  onQueryChange: (query: string) => void;
  queryPlaceholder?: string;
  emptyLabel?: string;
  inputClassName?: string;
  listClassName?: string;
}
