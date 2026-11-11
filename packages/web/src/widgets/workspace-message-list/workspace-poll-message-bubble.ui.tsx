import { useEffect, useState } from "react";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { WorkspaceAvatar } from "~/features/workspace-avatar/workspace-avatar.ui";
import { WorkspaceMessagePollConnected } from "~/features/workspace-message-poll/workspace-message-poll-connected.ui";
import { usePollDeadline } from "~/features/workspace-message-poll/workspace-poll-deadline.hook";
import { WorkspaceMessageBubblePresentation } from "./workspace-message-bubble-presentation.ui";
import type { WorkspaceMessageBubbleProps } from "./workspace-message-bubble.types";

export function WorkspacePollMessageBubble(
  props: WorkspaceMessageBubbleProps & { source: MessengerMessage },
) {
  const account = useWorkspaceAuthStore((state) => state.currentAccountId);
  const generation = useWorkspaceAuthStore((state) => state.runtimeGeneration);
  return (
    <PollBubbleSession
      key={`${account}:${generation}:${props.source.streamUuid}:${props.source.uuid}`}
      {...props}
    />
  );
}

function PollBubbleSession({
  source,
  ...props
}: WorkspaceMessageBubbleProps & { source: MessengerMessage }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const stream = useMessengerStore((state) => state.streamsById[source.streamUuid]);
  const owner = useMessengerStore((state) => state.ownerKey);
  const runtime = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
  const expired = usePollDeadline(source.payload.kind === "poll" ? source.payload.closesAt : null);
  const participant =
    runtime != null &&
    owner === workspaceRuntimeOwnerKey(runtime) &&
    stream?.projectId === runtime.projectId &&
    stream.userUuid === runtime.userUuid &&
    stream.sourceName === "native" &&
    stream.encryption !== true &&
    !stream.isArchived;
  const canManage =
    source.payload.kind === "poll" &&
    source.pollState != null &&
    !source.pollState.isClosed &&
    !expired &&
    participant &&
    (source.authorUuid === runtime.userUuid ||
      ["owner", "administrator", "moderator"].includes(stream.role)) &&
    props.presentationMode !== "preview";
  useEffect(() => {
    if (!canManage) {
      setSettingsOpen(false);
      setCloseOpen(false);
    }
  }, [canManage]);
  return (
    <WorkspaceMessageBubblePresentation
      {...props}
      pollBody
      onPollSettings={canManage ? () => setSettingsOpen(true) : undefined}
      onPollClose={canManage ? () => setCloseOpen(true) : undefined}
      bodyOverride={
        <WorkspaceMessagePollConnected
          message={source}
          usersById={props.usersById}
          renderVoterAvatar={(voter) => (
            <WorkspaceAvatar avatarUrn={voter.avatarUrl} size="sm">
              {voter.name.slice(0, 1)}
            </WorkspaceAvatar>
          )}
          readOnly={!participant || props.presentationMode === "preview"}
          deadlineReached={expired}
          settingsOpen={settingsOpen && canManage}
          closeOpen={closeOpen && canManage}
          {...{ setSettingsOpen, setCloseOpen }}
        />
      }
    />
  );
}
