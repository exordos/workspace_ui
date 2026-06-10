import React from "react";

export interface SidebarMessagePreviewProps {
  senderName?: string;
  message?: string;
  className?: string;
}

/** Single-line sidebar preview: colored sender name + message snippet. */
export const SidebarMessagePreview = React.memo<SidebarMessagePreviewProps>(
  function SidebarMessagePreview({ senderName, message, className }) {
    const previewText = message ?? "";
    if (!senderName && previewText.length === 0) {
      return null;
    }

    return (
      <div className={`mt-0.5 truncate text-xs ${className ?? ""}`}>
        {senderName && <span className="text-sidebar-sender">{senderName}</span>}
        {senderName && previewText.length > 0 && <span className="text-text-muted">: </span>}
        {previewText.length > 0 && <span className="text-text-muted">{previewText}</span>}
      </div>
    );
  },
);
