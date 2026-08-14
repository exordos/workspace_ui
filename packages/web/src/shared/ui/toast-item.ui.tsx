import React, { useCallback } from "react";
import { Icon } from "~/shared/ui/icon";
import type { ToastItemProps } from "./toast-item.types";

const variantClasses: Record<ToastItemProps["toast"]["variant"], string> = {
  error: "border-notice-base/40 bg-notice-base/10 text-notice-base",
  success: "border-border-subtle bg-bg-elevated text-text-primary",
  info: "border-border-subtle bg-bg-elevated text-text-primary",
};

export const ToastItem = React.memo(function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const handleDismiss = useCallback(() => {
    onDismiss(toast.id);
  }, [onDismiss, toast.id]);

  return (
    <div
      role="alert"
      className={`flex max-w-sm items-start gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg ${variantClasses[toast.variant]}`}
    >
      {toast.variant === "success" ? (
        <span
          className="bg-accent/15 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-accent"
          data-testid="toast-success-icon"
        >
          <Icon name="check" size={14} />
        </span>
      ) : null}
      <p className="min-w-0 flex-1 leading-snug">{toast.message}</p>
      <button
        type="button"
        onClick={handleDismiss}
        className="hover:bg-bg/40 shrink-0 rounded p-0.5 opacity-80 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        aria-label="Dismiss"
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
});
