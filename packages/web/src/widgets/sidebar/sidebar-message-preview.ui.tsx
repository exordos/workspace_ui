import React from "react";

export interface SidebarMessagePreviewProps {
  senderName?: string;
  message?: string;
  className?: string;
  messageClassName?: string;
}

function resolvePreviewRootTextClass(messageClassName?: string): string {
  // Ellipsis inherits from the truncating element — keep it aligned with message body color.
  if (messageClassName != null && /\btext-text-primary\b/.test(messageClassName)) {
    return "text-text-primary";
  }
  return "text-text-muted";
}

/** Single-line sidebar preview: colored sender name + message snippet. */
export const SidebarMessagePreview = React.memo<SidebarMessagePreviewProps>(
  function SidebarMessagePreview({ senderName, message, className, messageClassName }) {
    const previewText = message ?? "";
    if (!senderName && previewText.length === 0) {
      return null;
    }

    const rootTextClass = resolvePreviewRootTextClass(messageClassName);

    return (
      <div className={`min-w-0 truncate text-xs ${rootTextClass} ${className ?? ""}`}>
        {senderName && <span className="text-sidebar-sender">{senderName}</span>}
        {senderName && previewText.length > 0 && <span>: </span>}
        {previewText.length > 0 && (
          <span className={messageClassName ?? undefined}>{previewText}</span>
        )}
      </div>
    );
  },
);
