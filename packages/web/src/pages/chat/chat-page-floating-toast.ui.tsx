import React from "react";
import type { ChatPageFloatingToastProps } from "./chat-page-floating-toast.types";

export const ChatPageFloatingToast = React.memo(function ChatPageFloatingToast({
  message,
}: ChatPageFloatingToastProps) {
  if (message == null || message.length === 0) return null;

  return (
    <div className="fixed bottom-20 left-1/2 z-toast -translate-x-1/2 rounded-lg border border-border-subtle bg-bg-elevated px-4 py-2 text-sm text-text-primary shadow-lg">
      {message}
    </div>
  );
});
