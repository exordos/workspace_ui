import React from "react";
import { Button } from "~/shared/ui/button";
import { Icon } from "~/shared/ui/icon";

export interface EncryptedChatServiceMessageProps {
  kind: "key_request" | "key_grant" | "key_announced" | "key_reject";
  title: string;
  actorName?: string;
  actionPlacement?: "title" | "description";
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
  key_request: null,
  key_grant: "check",
  key_announced: "warning",
  key_reject: "close",
} as const;

/** The caller supplies labels and permitted actions; this view never handles keys. */
export function EncryptedChatServiceMessage({
  kind,
  title,
  actorName,
  actionPlacement = "title",
  description,
  statusText,
  actions,
}: Readonly<EncryptedChatServiceMessageProps>): React.ReactElement {
  const actionButtons = actions?.map((action) => (
    <Button
      key={action.label}
      type="button"
      size="sm"
      appearance="ghost"
      variant="neutral"
      className="!h-auto !rounded-sm !bg-transparent !p-0 !text-sm !font-normal !text-text-primary underline underline-offset-2"
      disabled={action.disabled}
      onClick={action.onClick}
    >
      {action.label}
    </Button>
  ));
  return (
    <div
      className="flex w-full flex-col items-center gap-1 py-1 text-center text-sm text-accent"
      data-encrypted-service-message={kind}
    >
      <div className="flex max-w-full flex-wrap items-center justify-center gap-1">
        {SERVICE_ICONS[kind] != null ? (
          <Icon name={SERVICE_ICONS[kind]} size={24} className="shrink-0 text-current" />
        ) : null}
        {actorName ? <span className="text-text-primary">{actorName}</span> : null}
        <span>{title}</span>
        {actionPlacement === "title" ? actionButtons : null}
      </div>
      {description ? (
        <div className="flex flex-wrap items-center justify-center gap-1">
          <span>{description}</span>
          {actionPlacement === "description" ? actionButtons : null}
        </div>
      ) : null}
      {statusText ? <p role="status">{statusText}</p> : null}
    </div>
  );
}
