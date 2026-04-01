import type { MockMessage } from "~/shared/api/zulip.types";

export interface SearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectMessage: (msg: MockMessage) => void;
  onSelectUser?: (userId: number) => void;
}
