import React from "react";
import { Skeleton } from "~/shared/ui/skeleton.ui";

export const WorkspaceMessageBubbleSkeleton = React.memo(function WorkspaceMessageBubbleSkeleton({
  align = "start",
  animated = true,
}: {
  align?: "start" | "end";
  animated?: boolean;
}) {
  return (
    <div
      className={`flex ${align === "end" ? "justify-end" : "justify-start"}`}
      aria-hidden="true"
      data-message-bubble-skeleton="true"
    >
      <div className="bg-border-subtle/40 w-[min(72%,32rem)] space-y-2 rounded-[18px] px-3 py-3">
        <Skeleton animated={animated} className="h-3 w-1/3" />
        <Skeleton animated={animated} className="h-3 w-full" />
        <Skeleton animated={animated} className="h-3 w-2/3" />
      </div>
    </div>
  );
});
