import React from "react";
import { useActivityStore } from "~/entities/activity/activity.model";
import type { MessengerSidebarActivityCounts } from "~/entities/messenger/messenger-sidebar.lib";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { useSettingsStore } from "~/features/settings/settings.model";
import { t } from "~/i18n/i18n";
import { SidebarActivityView } from "./sidebar-activity-view.ui";
import type { SidebarActivityProps } from "./sidebar-activity.types";

export interface WorkspaceSidebarActivityProps extends SidebarActivityProps {
  counts: MessengerSidebarActivityCounts;
}

export const WorkspaceSidebarActivity: React.FC<WorkspaceSidebarActivityProps> = ({
  open,
  onToggle,
  counts,
}) => {
  const isCompactDensity = useSettingsStore((s) => s.chatListDensity === "compact");
  const currentAccountId = useWorkspaceAuthStore((s) => s.currentAccountId);
  const currentSession = useWorkspaceAuthStore(
    (s) => s.sessions.find((session) => session.accountId === currentAccountId) ?? null,
  );
  const ownerKey = currentSession == null ? null : workspaceRuntimeOwnerKey(currentSession);
  const unreadMentionsCount = useActivityStore((s) =>
    s.unreadMentionsOwnerKey === ownerKey ? s.unreadMentionsCount : null,
  );

  return (
    <SidebarActivityView
      open={open}
      onToggle={onToggle}
      counts={{
        inbox: counts.inboxCount,
        mentions: unreadMentionsCount,
        drafts: null,
        markedMessages: null,
      }}
      disabledItems={{
        reactions: t("workspaceMessenger.reactionsUnsupported"),
        feed: t("workspaceMessenger.feedUnsupported"),
      }}
      isCompactDensity={isCompactDensity}
    />
  );
};
