export interface RightDrawerContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  openUserProfile?: (userId: number) => void;
}
