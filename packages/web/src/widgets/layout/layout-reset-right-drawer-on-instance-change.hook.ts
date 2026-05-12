import { useEffect, useRef } from "react";

interface UseLayoutResetRightDrawerOnInstanceChangeOptions {
  currentInstanceId: string | null;
  closeRightDrawer: () => void;
}

const INITIAL_INSTANCE_ID = Symbol("initial-instance-id");

export function useLayoutResetRightDrawerOnInstanceChange({
  currentInstanceId,
  closeRightDrawer,
}: UseLayoutResetRightDrawerOnInstanceChangeOptions): void {
  const previousInstanceIdRef = useRef<string | null | typeof INITIAL_INSTANCE_ID>(
    INITIAL_INSTANCE_ID,
  );

  useEffect(() => {
    const previousInstanceId = previousInstanceIdRef.current;

    if (previousInstanceId !== INITIAL_INSTANCE_ID && previousInstanceId !== currentInstanceId) {
      closeRightDrawer();
    }

    previousInstanceIdRef.current = currentInstanceId;
  }, [currentInstanceId, closeRightDrawer]);
}
