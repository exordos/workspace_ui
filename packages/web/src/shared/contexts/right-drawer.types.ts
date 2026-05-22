export interface RightDrawerContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  openInfo?: () => void;
  openUserProfile?: (userId: number) => void;
}
