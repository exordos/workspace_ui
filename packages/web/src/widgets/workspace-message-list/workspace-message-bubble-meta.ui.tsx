import React from "react";
import type { WorkspaceMessageBubbleMetaPlacement } from "./workspace-message-bubble-meta-placement.lib";
import "./workspace-message-bubble-meta.css";

interface WorkspaceMessageBubbleMetaProps {
  time: string;
  createdAt: string;
  placement?: WorkspaceMessageBubbleMetaPlacement;
  className?: string;
  after?: React.ReactNode;
}

export const WorkspaceMessageBubbleMeta = React.memo(
  React.forwardRef<HTMLSpanElement, WorkspaceMessageBubbleMetaProps>(
    function WorkspaceMessageBubbleMeta(
      { time, createdAt, placement = "row", className = "", after = null },
      ref,
    ): React.ReactElement {
      const placementClassName =
        placement === "inline" ? "pointer-events-auto absolute bottom-2 right-3 z-base" : "";

      return (
        <span
          ref={ref}
          className={`flex items-center gap-1 text-xs leading-4 text-text-muted ${placementClassName} ${className}`}
          data-message-meta-placement={placement}
        >
          <time
            dateTime={createdAt}
            data-message-time="true"
            data-message-meta-placement={placement}
          >
            {time}
          </time>
          {after}
        </span>
      );
    },
  ),
);
