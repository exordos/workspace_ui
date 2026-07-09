export type SearchModalMode = "zulip" | "workspace";

export interface SearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectUserUuid?: (userUuid: string) => boolean | void;
  mode?: SearchModalMode;
}
