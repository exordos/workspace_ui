import React from "react";
import { Badge } from "~/shared/ui/badge";

/** Unread count on folder rail icons — isolated from folder button text/icon color inheritance. */
export const FolderRailUnreadBadge = React.memo<{ count: number }>(function FolderRailUnreadBadge({
  count,
}) {
  return (
    <span className="inline-flex text-badge-text" style={{ color: "var(--color-badge-text)" }}>
      <Badge count={count} variant="unread" size="sm" className="!text-badge-text" />
    </span>
  );
});
