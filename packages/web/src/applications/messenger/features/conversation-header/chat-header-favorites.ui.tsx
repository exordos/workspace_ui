import React from "react";
import { t } from "~/i18n/i18n";
import { ChatHeaderShell } from "./chat-header-shell.ui";

export const ChatFavoritesHeader: React.FC = () => (
  <ChatHeaderShell infoLabel={t("activity.favorites")}>
    <h1 className="truncate text-base font-semibold text-text-primary">
      {t("activity.favorites")}
    </h1>
  </ChatHeaderShell>
);
