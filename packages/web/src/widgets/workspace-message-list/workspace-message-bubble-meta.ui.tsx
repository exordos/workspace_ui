import React from "react";
import type { WorkspaceMessageBubbleMetaPlacement } from "./workspace-message-bubble-meta-placement.lib";
import "./workspace-message-bubble-meta.css";

interface WorkspaceMessageBubbleMetaProps {
  time: string;
  createdAt: string;
  placement?: WorkspaceMessageBubbleMetaPlacement;
  className?: string;
}

export const WorkspaceMessageBubbleMeta = React.memo(
  React.forwardRef<HTMLTimeElement, WorkspaceMessageBubbleMetaProps>(
    function WorkspaceMessageBubbleMeta(
      { time, createdAt, placement = "row", className = "" },
      ref,
    ): React.ReactElement {
      const placementClassName =
        placement === "inline" ? "pointer-events-auto absolute bottom-2 right-3 z-base" : "";

      return (
        <time
          ref={ref}
          className={`flex items-center text-xs leading-4 text-text-muted ${placementClassName} ${className}`}
          dateTime={createdAt}
          data-message-time="true"
          data-message-meta-placement={placement}
        >
          {time}
        </time>
      );
    },
  ),
);
