import React from "react";
import type { ChatPageTypingLineProps } from "./chat-page-typing-line.types";

export const ChatPageTypingLine = React.memo(function ChatPageTypingLine({
  text,
  visible,
}: ChatPageTypingLineProps) {
  if (!visible || text == null || text.length === 0) return null;

  return (
    <div className="flex-shrink-0 px-4 py-1">
      <span className="text-xs italic text-text-muted">{text}</span>
    </div>
  );
});
