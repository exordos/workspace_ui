import React, { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useWorkspaceSelfChat } from "~/features/workspace-self-chat/workspace-self-chat.hook";
import { t } from "~/i18n/i18n";
import { useRightDrawer } from "~/shared/contexts/right-drawer";
import { parseWorkspaceMessengerRoute } from "~/shared/lib/workspace-messenger-route.lib";
import { Spinner } from "~/shared/ui/spinner.ui";
import { ChatFavoritesHeader } from "~/widgets/chat-view/chat-header-favorites.ui";
import { WorkspaceChatPage } from "./chat-page-workspace.ui";

export const ChatPage: React.FC = () => {
  const location = useLocation();
  const workspaceRoute = useMemo(
    () => parseWorkspaceMessengerRoute(location.pathname),
    [location.pathname],
  );

  return <WorkspaceChatPage route={workspaceRoute} />;
};

export const FavoritesPage: React.FC = () => {
  const location = useLocation();
  const workspaceRoute = useMemo(
    () => parseWorkspaceMessengerRoute(location.pathname),
    [location.pathname],
  );
  const favoritesRoute =
    workspaceRoute?.kind === "activity" && workspaceRoute.filter === "favorites"
      ? workspaceRoute
      : null;
  const rightDrawer = useRightDrawer();
  const setRightDrawerOpen = rightDrawer?.setOpen;
  const selfChat = useWorkspaceSelfChat({
    organizationId: favoritesRoute?.orgId ?? null,
    projectId: favoritesRoute?.projectId ?? null,
  });

  useEffect(() => {
    setRightDrawerOpen?.(false);
  }, [setRightDrawerOpen]);

  if (selfChat.status === "ready") {
    return <WorkspaceChatPage route={selfChat.route} presentation="favorites" />;
  }

  return (
    <div className="flex max-h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <ChatFavoritesHeader />
      <section className="flex min-h-0 flex-1 items-center justify-center p-4">
        {selfChat.status === "loading" ? (
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <Spinner size="sm" />
            <span>{t("app.loading")}</span>
          </div>
        ) : (
          <div className="max-w-sm rounded-lg border border-border-subtle p-4 text-center">
            <p className="text-sm text-notice-base">{t("favorites.loadError")}</p>
            <button
              type="button"
              onClick={selfChat.retry}
              className="mt-3 rounded-md px-3 py-1.5 text-sm text-accent hover:bg-card-bg"
            >
              {t("app.retry")}
            </button>
          </div>
        )}
      </section>
    </div>
  );
};
