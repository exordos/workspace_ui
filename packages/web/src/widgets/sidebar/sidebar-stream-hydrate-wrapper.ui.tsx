import React from "react";
import { useStreamSidebarTopicsHydrate } from "./sidebar-stream-topics-hydrate.hook";

export interface SidebarStreamHydrateWrapperProps {
  streamId: number;
  topicsCount: number;
  expanded: boolean;
  children: (state: { topicsLoading: boolean }) => React.ReactNode;
  onContextMenu?: React.MouseEventHandler<HTMLDivElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
}

/** Observes stream row visibility and triggers lazy topic hydrate when topics are empty. */
export const SidebarStreamHydrateWrapper = React.memo<SidebarStreamHydrateWrapperProps>(
  function SidebarStreamHydrateWrapper({
    streamId,
    topicsCount,
    expanded,
    children,
    onContextMenu,
    onKeyDown,
  }) {
    const { rowRef, topicsLoading } = useStreamSidebarTopicsHydrate({
      streamId,
      topicsCount,
      expanded,
    });
    return (
      <div ref={rowRef} onContextMenu={onContextMenu} onKeyDown={onKeyDown}>
        {children({ topicsLoading })}
      </div>
    );
  },
);
