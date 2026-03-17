import React from "react";

export const OpenSearchContext = React.createContext<(() => void) | null>(null);

export function useOpenSearch(): (() => void) | null {
  return React.useContext(OpenSearchContext);
}
