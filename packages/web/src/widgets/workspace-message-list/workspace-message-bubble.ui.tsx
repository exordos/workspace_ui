import React from "react";
import { WorkspaceEncryptedMessageBubble } from "./workspace-encrypted-message-bubble.ui";
import { WorkspaceMessageBubblePresentation } from "./workspace-message-bubble-presentation.ui";
import type { WorkspaceMessageBubbleProps } from "./workspace-message-bubble.types";

export const WorkspaceMessageBubble = React.memo(function WorkspaceMessageBubble(
  props: WorkspaceMessageBubbleProps,
) {
  if (props.message.kind === "server" && props.message.message.payload.kind !== "markdown") {
    return <WorkspaceEncryptedMessageBubble {...props} message={props.message.message} />;
  }
  return <WorkspaceMessageBubblePresentation {...props} />;
});
