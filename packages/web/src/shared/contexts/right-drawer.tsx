import React from "react";
import type { RightDrawerContextValue } from "./right-drawer.types";

export const RightDrawerContext = React.createContext<RightDrawerContextValue | null>(null);

export function useRightDrawer(): RightDrawerContextValue | null {
  return React.useContext(RightDrawerContext);
}
