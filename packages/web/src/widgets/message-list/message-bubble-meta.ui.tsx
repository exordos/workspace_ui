import React from "react";
import "./message-bubble-meta.css";

interface MessageBubbleMetaProps {
  time: string;
  ownDeliveryIndicator: React.ReactNode;
  placement?: "row" | "inline";
  className?: string;
}

export const MessageBubbleMeta = React.memo(
  React.forwardRef<HTMLDivElement, MessageBubbleMetaProps>(function MessageBubbleMeta(
    { time, ownDeliveryIndicator, placement = "row", className = "" },
    ref,
  ) {
    const placementClass =
      placement === "inline" ? "pointer-events-auto absolute bottom-2 right-3 z-base" : "";

    return (
      <div
        ref={ref}
        className={`flex items-center gap-1 text-[11px] text-text-muted ${placementClass} ${className}`}
      >
        <span>{time}</span>
        {ownDeliveryIndicator}
      </div>
    );
  }),
);
