import React from "react";
import { Button } from "~/shared/ui/button";
import { Icon } from "~/shared/ui/icon";

export interface EncryptedMessagePlaceholderProps {
  state: "locked" | "loading" | "error";
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
}

/** Never accepts plaintext: the blurred lines are empty decorative shapes. */
export function EncryptedMessagePlaceholder({
  state,
  title,
  description,
  action,
}: Readonly<EncryptedMessagePlaceholderProps>): React.ReactElement {
  return (
    <div className="max-w-md rounded-xl border border-border-subtle bg-bg-elevated p-4">
      <div aria-hidden="true" className="mb-4 space-y-2 blur-sm">
        <div className="bg-text-muted/25 h-2 w-4/5 rounded-full" />
        <div className="bg-text-muted/25 h-2 w-full rounded-full" />
        <div className="bg-text-muted/25 h-2 w-3/5 rounded-full" />
      </div>
      <div
        role={state === "error" ? "alert" : "status"}
        aria-busy={state === "loading"}
        className="flex items-start gap-2"
      >
        <Icon
          name={state === "error" ? "info" : "visibility"}
          size={18}
          className="mt-0.5 shrink-0 text-text-muted"
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary">{title}</p>
          {description ? <p className="mt-1 text-xs text-text-muted">{description}</p> : null}
        </div>
      </div>
      {action ? (
        <Button
          type="button"
          size="sm"
          appearance="outline"
          className="mt-3"
          onClick={action.onClick}
          disabled={state === "loading" ? true : action.disabled}
        >
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
