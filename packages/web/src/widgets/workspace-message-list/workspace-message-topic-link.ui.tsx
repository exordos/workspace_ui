import React from "react";
import type { MessengerUuid } from "~/entities/messenger/messenger.types";
import type { WorkspaceMessageListActions } from "./workspace-message-list.types";

interface WorkspaceMessageTopicLinkProps {
  label: string;
  streamUuid: MessengerUuid;
  topicUuid: MessengerUuid;
  onOpenWorkspaceReference?: WorkspaceMessageListActions["onOpenWorkspaceReference"];
}

export const WorkspaceMessageTopicLink = React.memo(function WorkspaceMessageTopicLink({
  label,
  streamUuid,
  topicUuid,
  onOpenWorkspaceReference,
}: WorkspaceMessageTopicLinkProps): React.ReactElement {
  if (onOpenWorkspaceReference == null) {
    return <span>{label}</span>;
  }

  return (
    <button
      type="button"
      className="min-w-0 truncate rounded-sm text-left transition-colors hover:text-text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
      data-topic-link="true"
      onClick={() => {
        onOpenWorkspaceReference({ kind: "topic", streamUuid, topicUuid });
      }}
    >
      {label}
    </button>
  );
});
