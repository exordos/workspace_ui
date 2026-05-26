import React, { useCallback } from "react";
import { createPortal } from "react-dom";
import { useToastStore } from "~/shared/lib/toast/toast.model";
import { ToastItem } from "./toast-item.ui";

export const ToastHost: React.FC = () => {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  const handleDismiss = useCallback(
    (id: string) => {
      dismiss(id);
    },
    [dismiss],
  );

  if (toasts.length === 0) {
    return null;
  }

  const host = (
    <div
      className="pointer-events-none fixed right-4 top-4 z-toast flex w-full max-w-sm flex-col gap-2"
      aria-live="polite"
      aria-atomic="false"
      data-testid="toast-host"
    >
      {toasts.map((entry) => (
        <div key={entry.id} className="pointer-events-auto">
          <ToastItem toast={entry} onDismiss={handleDismiss} />
        </div>
      ))}
    </div>
  );

  if (typeof document === "undefined") {
    return host;
  }

  return createPortal(host, document.body);
};
