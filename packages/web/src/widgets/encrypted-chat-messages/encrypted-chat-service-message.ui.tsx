import React from "react";
import { Button } from "~/shared/ui/button";
import { Icon } from "~/shared/ui/icon";

export interface EncryptedChatServiceMessageProps {
  kind: "key_request" | "key_grant" | "key_announced" | "key_reject";
  title: string;
  description?: string;
  deviceName?: string;
  statusText?: string;
  actions?: readonly {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    variant?: "primary" | "neutral" | "danger";
  }[];
}

const SERVICE_ICONS = {
  key_request: "desktop_windows",
  key_grant: "check",
  key_announced: "info",
  key_reject: "block",
} as const;

/** The caller supplies labels and permitted actions; this view never handles keys. */
export function EncryptedChatServiceMessage({
  kind,
  title,
  description,
  deviceName,
  statusText,
  actions,
}: Readonly<EncryptedChatServiceMessageProps>): React.ReactElement {
  return (
    <div className="flex max-w-lg items-start gap-3 rounded-lg border border-border-subtle bg-bg-elevated p-3">
      <Icon name={SERVICE_ICONS[kind]} size={20} className="mt-0.5 shrink-0 text-text-muted" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary">{title}</p>
        {deviceName ? (
          <p className="mt-1 break-words text-xs text-text-secondary">{deviceName}</p>
        ) : null}
        {description ? <p className="mt-1 text-xs text-text-muted">{description}</p> : null}
        {statusText ? <p className="mt-2 text-xs text-text-muted">{statusText}</p> : null}
        {actions?.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {actions.map((action) => (
              <Button
                key={action.label}
                type="button"
                size="sm"
                appearance="outline"
                variant={action.variant ?? "neutral"}
                disabled={action.disabled}
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
