import type { MockMessage } from "~/shared/api/zulip.types";

export type SearchModalMode = "zulip" | "workspace";

export interface SearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectMessage: (msg: MockMessage) => void;
  onSelectUser?: (userId: number) => void;
  mode?: SearchModalMode;
}
