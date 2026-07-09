import React from "react";
import { PresenceIndicator } from "~/shared/ui/presence-indicator";
import { SelectableRow } from "~/shared/ui/selectable-row.ui";

export const MAX_USER_RESULTS = 20;

export const UserResultItem = React.memo(function UserResultItem({
  userIdentity,
  fullName,
  email,
  statusLabel,
  presenceState,
  onSelect,
}: {
  userIdentity: string;
  fullName: string;
  email?: string;
  statusLabel?: string;
  presenceState: "active" | "idle" | "offline" | null;
  onSelect: () => void;
}) {
  const secondaryText = statusLabel ?? email ?? "";

  return (
    <li>
      <SelectableRow
        as="button"
        onClick={onSelect}
        className="w-full"
        aria-label={`${fullName} (${email ?? userIdentity})`}
      >
        <PresenceIndicator status={presenceState} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-text-primary">{fullName}</span>
          {secondaryText.length > 0 ? (
            <span className="block truncate text-[11px] text-text-secondary">{secondaryText}</span>
          ) : null}
        </span>
      </SelectableRow>
    </li>
  );
});
