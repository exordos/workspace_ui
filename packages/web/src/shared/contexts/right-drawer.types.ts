import type { UserId } from "~/shared/lib/user-id.lib";

export interface RightDrawerContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  openInfo?: () => void;
  openUserProfile?: (userId: UserId) => void;
}
