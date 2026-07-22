import React from "react";

interface WorkspaceMessageDividerProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string | null;
  children?: React.ReactNode;
  tone?: "muted" | "notice";
}

export const WorkspaceMessageDivider = React.memo(function WorkspaceMessageDivider({
  label,
  children,
  tone = "muted",
  className = "",
  ...props
}: WorkspaceMessageDividerProps): React.ReactElement {
  const normalizedLabel = label?.trim() ?? "";
  const lineClassName = tone === "notice" ? "bg-notice-base/30" : "bg-border-subtle";
  const textClassName = tone === "notice" ? "text-notice-base" : "text-text-muted";

  return (
    <div
      className={`flex items-center gap-2 px-4 py-1 text-xs ${textClassName} ${className}`}
      {...props}
    >
      <div className={`${lineClassName} h-px flex-1`} />
      {children ?? (normalizedLabel.length > 0 ? <span>{normalizedLabel}</span> : null)}
      <div className={`${lineClassName} h-px flex-1`} />
    </div>
  );
});
