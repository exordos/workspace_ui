import type { UserPickerOption } from "~/shared/lib/user-picker";

export interface UserPickerListProps {
  options: readonly UserPickerOption[];
  selectedUserIds: ReadonlySet<number>;
  onToggle: (userId: number) => void;
  query: string;
  onQueryChange: (query: string) => void;
  queryPlaceholder?: string;
  emptyLabel?: string;
  inputClassName?: string;
  listClassName?: string;
}
