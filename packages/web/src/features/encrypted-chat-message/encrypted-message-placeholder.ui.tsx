import React from "react";

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
}: Readonly<EncryptedMessagePlaceholderProps>): React.ReactElement {
  return (
    <div
      role={state === "error" ? "alert" : "status"}
      aria-busy={state === "loading"}
      className="w-[min(30rem,60vw)] max-w-full"
      data-encrypted-message-placeholder="true"
    >
      <span className="sr-only">{title}</span>
      <div
        aria-hidden="true"
        className="flex h-9 flex-col justify-center gap-2 overflow-hidden blur-[6px]"
      >
        <div className="bg-text-muted/35 h-2 w-[92%] rounded-full" />
        <div className="bg-text-muted/35 h-2 w-[65%] rounded-full" />
      </div>
    </div>
  );
}
