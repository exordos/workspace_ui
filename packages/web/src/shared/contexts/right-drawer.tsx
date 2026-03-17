import React from "react";

interface RightDrawerContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  openUserProfile?: (userId: number) => void;
}

export const RightDrawerContext = React.createContext<RightDrawerContextValue | null>(null);

export function useRightDrawer(): RightDrawerContextValue | null {
  return React.useContext(RightDrawerContext);
}
