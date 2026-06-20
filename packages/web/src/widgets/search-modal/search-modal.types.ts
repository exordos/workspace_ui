import type { MockMessage } from "~/shared/api/messenger.types";
import type { UserId } from "~/shared/lib/user-id.lib";

export interface SearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectMessage: (msg: MockMessage) => void;
  onSelectUser?: (userId: UserId) => void;
}
