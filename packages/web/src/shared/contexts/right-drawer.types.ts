export interface RightDrawerContextValue {
  open: boolean;
  chatInfoOpen?: boolean;
  setOpen: (open: boolean) => void;
  toggleChatInfo: () => void;
  closeCurrent: () => void;
  openInfo?: () => void;
  openUserProfile?: (userId: number) => void;
  openWorkspaceUserProfile?: (userUuid: string) => void;
}
