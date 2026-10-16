import React from "react";
import { Button } from "~/shared/ui/button";
import { Icon } from "~/shared/ui/icon";
import type { IconName } from "~/shared/ui/icon";

export type WorkspaceMessageBubbleQuickActionsVisibility = "disabled" | "hover" | "always";

export interface WorkspaceMessageBubbleQuickActionsConfig {
  readonly message?: WorkspaceMessageBubbleQuickActionsVisibility;
  readonly missingKey?: WorkspaceMessageBubbleQuickActionsVisibility;
}

export interface WorkspaceMessageBubbleQuickAction {
  readonly key: string;
  readonly label: string;
  readonly icon?: IconName;
  readonly glyph?: string;
  readonly onSelect: () => void;
  readonly disabled?: boolean;
  readonly pending?: boolean;
  readonly pressed?: boolean;
  readonly showLabel?: boolean;
}

export interface WorkspaceMessageBubbleQuickActionsProps {
  readonly actions: readonly WorkspaceMessageBubbleQuickAction[];
  readonly visibility?: WorkspaceMessageBubbleQuickActionsVisibility;
  readonly condition?: boolean;
  readonly isOwn?: boolean;
}

const HOVER_VISIBILITY =
  "pointer-events-none opacity-0 group-hover/workspace-message-bubble:pointer-events-auto group-hover/workspace-message-bubble:opacity-100 group-focus-within/workspace-message-bubble:pointer-events-auto group-focus-within/workspace-message-bubble:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100";

export function WorkspaceMessageBubbleQuickActions({
  actions,
  visibility = "hover",
  condition = true,
  isOwn = false,
}: Readonly<WorkspaceMessageBubbleQuickActionsProps>): React.ReactElement | null {
  if (visibility === "disabled" || !condition || actions.length === 0) return null;

  return (
    <div
      className={`absolute top-1 z-10 flex max-w-[calc(100vw-5rem)] items-center gap-1 transition-opacity motion-reduce:transition-none ${isOwn ? "right-full pr-1" : "left-full pl-1"} ${visibility === "hover" ? HOVER_VISIBILITY : ""}`}
      data-workspace-message-quick-actions="true"
      data-visibility={visibility}
    >
      {actions.map((action) => (
        <Button
          key={action.key}
          type="button"
          size="sm"
          variant="neutral"
          className={`!h-7 !rounded-full shadow-sm aria-pressed:bg-accent-soft aria-pressed:text-accent ${(action.showLabel ?? action.glyph == null) ? "min-w-0 !px-2" : "!w-7 shrink-0 !px-0"}`}
          aria-label={action.label}
          aria-pressed={action.pressed}
          data-workspace-message-quick-action={action.key}
          title={action.label}
          disabled={action.disabled}
          loading={action.pending}
          leadingIcon={action.icon == null ? undefined : <Icon name={action.icon} size={16} />}
          onClick={(event) => {
            event.stopPropagation();
            action.onSelect();
          }}
        >
          {action.glyph == null || action.pending ? null : (
            <span aria-hidden="true" className="text-base leading-none">
              {action.glyph}
            </span>
          )}
          {(action.showLabel ?? action.glyph == null) ? (
            <span className="truncate whitespace-nowrap">{action.label}</span>
          ) : null}
        </Button>
      ))}
    </div>
  );
}
