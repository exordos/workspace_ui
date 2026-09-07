import { useEffect, useRef } from "react";

interface UseLayoutResetRightDrawerOnOwnerChangeOptions {
  currentOwnerKey: string | null;
  closeRightDrawer: () => void;
}

const INITIAL_OWNER_KEY = Symbol("initial-owner-key");

export function useLayoutResetRightDrawerOnOwnerChange({
  currentOwnerKey,
  closeRightDrawer,
}: UseLayoutResetRightDrawerOnOwnerChangeOptions): void {
  const previousOwnerKeyRef = useRef<string | null | typeof INITIAL_OWNER_KEY>(INITIAL_OWNER_KEY);

  useEffect(() => {
    const previousOwnerKey = previousOwnerKeyRef.current;

    if (previousOwnerKey !== INITIAL_OWNER_KEY && previousOwnerKey !== currentOwnerKey) {
      closeRightDrawer();
    }

    previousOwnerKeyRef.current = currentOwnerKey;
  }, [currentOwnerKey, closeRightDrawer]);
}
