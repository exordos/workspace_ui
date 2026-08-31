import React from "react";

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
      ? "p-2 [&>li+li]:relative [&>li+li]:pt-4 [&>li+li]:before:pointer-events-none [&>li+li]:before:absolute [&>li+li]:before:inset-x-0 [&>li+li]:before:top-2 [&>li+li]:before:h-px [&>li+li]:before:bg-border-subtle"
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
