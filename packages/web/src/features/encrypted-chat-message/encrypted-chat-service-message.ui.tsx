import React from "react";
import { Button } from "~/shared/ui/button";
import { Icon } from "~/shared/ui/icon";
import KeyGrantedIcon from "./assets/key-granted.svg?react";
import KeyRejectedIcon from "./assets/key-rejected.svg?react";

export interface EncryptedChatServiceMessageProps {
  kind: "key_request" | "key_grant" | "key_announced" | "key_reject";
  title: string;
  actorName?: string;
  actionPlacement?: "title" | "description" | "secondary";
  inlineDescription?: boolean;
  description?: string;
  secondaryDescription?: string;
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
  inlineDescription = false,
  description,
  secondaryDescription,
  statusText,
  actions,
}: Readonly<EncryptedChatServiceMessageProps>): React.ReactElement {
  const keyResponse = kind === "key_grant" || kind === "key_reject";
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
      <div
        className={`flex max-w-full items-center justify-center gap-1 ${keyResponse ? "" : "flex-wrap"}`}
      >
        {kind === "key_grant" ? (
          <KeyGrantedIcon aria-hidden className="shrink-0 [&_path]:fill-current" />
        ) : null}
        {kind === "key_reject" ? (
          <KeyRejectedIcon aria-hidden className="shrink-0 [&_path]:fill-current" />
        ) : null}
        {kind === "key_announced" ? (
          <Icon name={SERVICE_ICONS[kind]} size={24} className="shrink-0 text-current" />
        ) : null}
        {actorName ? <span className="text-text-primary">{actorName}</span> : null}
        <span className={keyResponse ? "min-w-0" : undefined}>
          <span>{title}</span>
          {inlineDescription && description ? (
            <>
              {" "}
              <span>{description}</span>
            </>
          ) : null}
        </span>
        {actionPlacement === "title" || (actionPlacement === "description" && inlineDescription)
          ? actionButtons
          : null}
      </div>
      {description && !inlineDescription ? (
        <div className="flex flex-wrap items-center justify-center gap-1">
          <span>{description}</span>
          {actionPlacement === "description" ? actionButtons : null}
        </div>
      ) : null}
      {secondaryDescription ? (
        <div className="flex flex-wrap items-center justify-center gap-1">
          <span>{secondaryDescription}</span>
          {actionPlacement === "secondary" ? actionButtons : null}
        </div>
      ) : null}
      {statusText ? <p role="status">{statusText}</p> : null}
    </div>
  );
}
