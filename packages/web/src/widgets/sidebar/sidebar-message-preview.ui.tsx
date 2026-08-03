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
  // Figma preview body: ~#9AA8D8 → text-secondary (not the darker text-muted).
  return "text-text-secondary";
}

/**
 * Shared preview line.
 * `min-h-5` is required: an empty div with only `leading-5` collapses to 0 height
 * (no line box), so topic rows without a last message would be shorter than filled ones.
 */
const PREVIEW_LINE_CLASS = "min-h-5 min-w-0 truncate text-xs font-normal leading-5";

/** Single-line sidebar preview: colored sender name + message snippet. */
export const SidebarMessagePreview = React.memo<SidebarMessagePreviewProps>(
  function SidebarMessagePreview({ senderName, message, className, messageClassName }) {
    const previewText = message ?? "";
    const isEmpty = !senderName && previewText.length === 0;

    // Always mount the line box so topic rows without a last message do not collapse.
    if (isEmpty) {
      return <div aria-hidden className={`${PREVIEW_LINE_CLASS} ${className ?? ""}`} />;
    }

    const rootTextClass = resolvePreviewRootTextClass(messageClassName);

    return (
      <div className={`${PREVIEW_LINE_CLASS} ${rootTextClass} ${className ?? ""}`}>
        {senderName && <span className="text-sidebar-sender">{senderName}</span>}
        {senderName && previewText.length > 0 && <span>: </span>}
        {previewText.length > 0 && (
          <span className={messageClassName ?? undefined}>{previewText}</span>
        )}
      </div>
    );
  },
);
