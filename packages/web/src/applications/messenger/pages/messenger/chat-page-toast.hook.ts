import { useEffect } from "react";

export function useChatToastAutoClear(options: {
  toastMessage: string | null;
  clearToast: () => void;
  timeoutMs?: number;
}): void {
  const { toastMessage, clearToast, timeoutMs = 2000 } = options;

  useEffect(() => {
    if (toastMessage == null) return;
    const t = setTimeout(() => clearToast(), timeoutMs);
    return () => clearTimeout(t);
  }, [toastMessage, clearToast, timeoutMs]);
}
