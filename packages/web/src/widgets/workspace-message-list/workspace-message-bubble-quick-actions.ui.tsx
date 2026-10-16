import React from "react";
import { Button } from "~/shared/ui/button";
import { Icon } from "~/shared/ui/icon";
import type { IconName } from "~/shared/ui/icon";
import { WorkspaceMessageBubbleReaction } from "./workspace-message-bubble-reaction.ui";

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
  readonly placement?: "top" | "corner";
  readonly reactions?: readonly WorkspaceMessageBubbleQuickAction[];
}

export interface WorkspaceMessageBubbleQuickActionsProps {
  readonly actions: readonly WorkspaceMessageBubbleQuickAction[];
  readonly visibility?: WorkspaceMessageBubbleQuickActionsVisibility;
  readonly condition?: boolean;
  readonly isOwn?: boolean;
}

const HOVER_VISIBILITY =
  "opacity-0 group-hover/workspace-message-bubble:opacity-100 group-focus-within/workspace-message-bubble:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100";
const HOVER_INTERACTIVITY =
  "pointer-events-none group-hover/workspace-message-bubble:pointer-events-auto group-focus-within/workspace-message-bubble:pointer-events-auto focus-within:pointer-events-auto [@media(hover:none)]:pointer-events-auto";

export function WorkspaceMessageBubbleQuickActions({
  actions,
  visibility = "hover",
  condition = true,
  isOwn = false,
}: Readonly<WorkspaceMessageBubbleQuickActionsProps>): React.ReactElement | null {
  if (visibility === "disabled" || !condition || actions.length === 0) return null;

  const renderAction = (action: WorkspaceMessageBubbleQuickAction) => {
    if (action.placement === "corner" && action.reactions != null) {
      return <WorkspaceMessageBubbleReaction key={action.key} action={action} isOwn={isOwn} />;
    }
    return (
      <Button
        key={action.key}
        type="button"
        size="sm"
        variant="neutral"
        className={`min-w-0 !rounded-full shadow-md aria-pressed:bg-accent-soft aria-pressed:text-accent ${action.placement === "corner" ? "!h-6 !w-6 shrink-0 !px-0" : "!h-7 !px-2.5"}`}
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
    );
  };

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-10 transition-opacity motion-reduce:transition-none ${visibility === "hover" ? HOVER_VISIBILITY : ""}`}
      data-workspace-message-quick-actions="true"
      data-visibility={visibility}
    >
      <div
        className={`absolute -top-5 flex max-w-[calc(100%-1.5rem)] items-center gap-1 ${isOwn ? "left-3" : "right-3"} ${visibility === "hover" ? HOVER_INTERACTIVITY : "pointer-events-auto"}`}
      >
        {actions.filter((action) => action.placement !== "corner").map(renderAction)}
      </div>
      <div
        className={`absolute -bottom-1 top-0 flex items-end gap-1 ${isOwn ? "right-full" : "left-full"} ${visibility === "hover" ? HOVER_INTERACTIVITY : "pointer-events-auto"}`}
      >
        {actions.filter((action) => action.placement === "corner").map(renderAction)}
      </div>
    </div>
  );
}
