import React from "react";
import { t } from "~/i18n/i18n";

export const ChatPageStreamTopicPrompt = React.memo(function ChatPageStreamTopicPrompt() {
  return (
    <div
      className="w-full border-t border-border-subtle bg-bg-elevated px-4 py-4 text-center text-sm text-text-muted"
      data-testid="stream-topic-prompt"
    >
      {t("chat.selectTopicToWrite")}
    </div>
  );
});
