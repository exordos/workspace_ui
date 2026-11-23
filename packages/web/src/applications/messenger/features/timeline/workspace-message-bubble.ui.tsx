import React from "react";
import {
  useMessagePresentation,
  usePreparedMessagePresentation,
} from "~/applications/messenger/features/decrypted-message/message-presentation.hook";
import type { MessengerMessage } from "~/applications/messenger/model/messenger.types";
import { WorkspacePollMessageBubble } from "../polls/workspace-poll-message-bubble.ui";
import { WorkspaceEncryptedMessageBubble } from "./workspace-encrypted-message-bubble.ui";
import { WorkspaceMessageContentBubble } from "./workspace-message-content-bubble.ui";
import type { WorkspaceMessageBubbleProps } from "./workspace-message-bubble.types";

function LocalWorkspaceMessageBubble({
  source,
  ...props
}: WorkspaceMessageBubbleProps & { readonly source: MessengerMessage }) {
  const content = useMessagePresentation(source);
  return <WorkspaceMessageContentBubble {...props} content={content} />;
}

export const WorkspaceMessageBubble = React.memo(function WorkspaceMessageBubble(
  props: WorkspaceMessageBubbleProps,
) {
  const source = props.message.kind === "server" ? props.message.message : null;
  const content = usePreparedMessagePresentation(source);
  if (source?.payload.kind === "poll")
    return <WorkspacePollMessageBubble {...props} source={source} />;
  if (source != null && content == null)
    return <LocalWorkspaceMessageBubble {...props} source={source} />;
  if (source != null && content?.status === "ready" && content.kind === "service") {
    return <WorkspaceEncryptedMessageBubble {...props} message={source} />;
  }
  return <WorkspaceMessageContentBubble {...props} content={content} />;
});
