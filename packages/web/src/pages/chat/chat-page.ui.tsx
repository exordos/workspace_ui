import React, { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { parseWorkspaceMessengerRoute } from "~/shared/lib/workspace-messenger-route.lib";
import { WorkspaceChatPage } from "./chat-page-workspace.ui";

export const ChatPage: React.FC = () => {
  const location = useLocation();
  const workspaceRoute = useMemo(
    () => parseWorkspaceMessengerRoute(location.pathname),
    [location.pathname],
  );

  return <WorkspaceChatPage route={workspaceRoute} />;
};
