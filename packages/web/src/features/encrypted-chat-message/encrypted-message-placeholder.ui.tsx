import React from "react";
import { Button } from "~/shared/ui/button";
import { Icon } from "~/shared/ui/icon";

export interface EncryptedMessagePlaceholderProps {
  state: "locked" | "loading" | "error";
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void; disabled?: boolean };
}

/** Only decorative geometry enters the DOM; unavailable plaintext is never blurred in place. */
export function EncryptedMessagePlaceholder({
  state,
  title,
  action,
}: Readonly<EncryptedMessagePlaceholderProps>): React.ReactElement {
  return (
    <div
      role={state === "error" ? "alert" : "status"}
      aria-busy={state === "loading"}
      className="w-[min(30rem,60vw)] max-w-full"
      data-encrypted-message-placeholder="true"
      data-encrypted-message-state={state}
    >
      {state === "error" ? (
        <div className="flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-muted">
          <Icon name="warning" size={16} className="shrink-0 text-current" />
          <span>{title}</span>
          {action ? (
            <Button
              type="button"
              appearance="ghost"
              variant="neutral"
              size="sm"
              className="!h-auto !rounded-sm !p-0 underline underline-offset-2"
              disabled={action.disabled}
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <span className="sr-only">{title}</span>
          <div
            aria-hidden="true"
            className="flex h-9 flex-col justify-center gap-2 overflow-hidden blur-[6px]"
          >
            <div className="bg-text-muted/35 h-2 w-[92%] rounded-full" />
            <div className="bg-text-muted/35 h-2 w-[65%] rounded-full" />
          </div>
        </>
      )}
    </div>
  );
}
