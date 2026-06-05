import React from "react";
import { Badge } from "./badge";

/** Unread count pill — same visual as folder rail badges. */
export const UnreadCountBadge = React.memo<{ count: number }>(function UnreadCountBadge({ count }) {
  return (
    <span className="inline-flex text-badge-text" style={{ color: "var(--color-badge-text)" }}>
      <Badge count={count} variant="unread" size="sm" className="!text-badge-text" />
    </span>
  );
});
