import React, { useEffect, useRef } from "react";
import { useFocusTrap } from "~/shared/lib/focus";

export interface AccessibleAlertDialogProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  onDismiss: () => void;
}

/** Inline alert dialog with modal keyboard semantics and focus restoration. */
export const AccessibleAlertDialog = React.memo<AccessibleAlertDialogProps>(
  function AccessibleAlertDialog({ children, label, onDismiss, ...props }) {
    const dialogRef = useRef<HTMLDivElement>(null);
    useFocusTrap(dialogRef, true);

    useEffect(() => {
      const dialog = dialogRef.current;
      if (dialog == null) return;
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.defaultPrevented || event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onDismiss();
      };
      dialog.addEventListener("keydown", handleKeyDown);
      return () => dialog.removeEventListener("keydown", handleKeyDown);
    }, [onDismiss]);

    return (
      <div
        {...props}
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-label={label}
        data-focus-zone="modal"
      >
        {children}
      </div>
    );
  },
);
