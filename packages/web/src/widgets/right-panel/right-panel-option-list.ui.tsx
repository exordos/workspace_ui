import React from "react";
import { Icon } from "~/shared/ui/icon";

/** Shared hover/focus treatment for sidebar list rows and selector options. */
export const RIGHT_PANEL_OPTION_INTERACTION_CLASS =
  "transition-colors hover:bg-card-bg-active focus-visible:bg-card-bg-active";

export interface RightPanelOptionButtonProps {
  label: React.ReactNode;
  active: boolean;
  onClick: () => void;
  testId?: string;
}

/** Selector option row shared by every nested Settings/Appearance list. */
export const RightPanelOptionButton = React.memo(function RightPanelOptionButton({
  label,
  active,
  onClick,
  testId,
}: RightPanelOptionButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      className={`flex w-full items-center justify-between gap-3 px-0 py-0 text-left text-sm leading-4 text-text-primary ${RIGHT_PANEL_OPTION_INTERACTION_CLASS} focus-visible:ring-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset`}
    >
      <span className={active ? "font-medium text-text-primary" : "text-text-primary"}>
        {label}
      </span>
      {active ? <Icon name="check" size={16} className="shrink-0 text-accent" /> : null}
    </button>
  );
});

interface RightPanelOptionListProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
  "aria-labelledby"?: string;
  role?: React.AriaRole;
  testId?: string;
  variant?: "default" | "spaced";
}

/** Shared bordered option surface for compact right-panel lists. */
export const RightPanelOptionList = React.memo(function RightPanelOptionList({
  children,
  className = "",
  id,
  "aria-labelledby": ariaLabelledBy,
  role,
  testId,
  variant = "default",
}: RightPanelOptionListProps): React.ReactElement {
  const variantClassName =
    variant === "spaced"
      ? "p-2 [&>li]:-mx-2 [&>li]:w-[calc(100%+1rem)] [&>li]:px-2 [&>li]:py-2 [&>li]:transition-colors [&>li:hover]:bg-card-bg-active [&>li:focus-within]:bg-card-bg-active [&>li:first-child]:-mt-2 [&>li:last-child]:-mb-2 [&>li+li]:relative [&>li+li]:before:pointer-events-none [&>li+li]:before:absolute [&>li+li]:before:inset-x-2 [&>li+li]:before:top-0 [&>li+li]:before:h-px [&>li+li]:before:bg-border-subtle"
      : "divide-y divide-border-subtle";
  const radiusClassName = variant === "spaced" ? "rounded-[8px]" : "rounded-lg";

  return (
    <ul
      className={`overflow-hidden ${radiusClassName} border border-border-subtle bg-bg-elevated ${variantClassName} ${className}`.trim()}
      id={id}
      aria-labelledby={ariaLabelledBy}
      role={role}
      data-testid={testId}
    >
      {children}
    </ul>
  );
});
