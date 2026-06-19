import type { MockMessage } from "~/shared/api/messenger.types";

export interface SearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectMessage: (msg: MockMessage) => void;
  onSelectUser?: (userId: number) => void;
}
