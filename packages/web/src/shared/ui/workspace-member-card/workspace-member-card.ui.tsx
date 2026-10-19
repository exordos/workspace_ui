import type { ReactNode } from "react";

export interface WorkspaceMemberCardProps {
  readonly avatar: ReactNode;
  readonly name: string;
  readonly roleLabel?: string | null;
  readonly secondaryText?: string | null;
  readonly action?: ReactNode;
}

/** Shared visual row for members listed in Workspace chat information panels. */
export function WorkspaceMemberCard({
  avatar,
  name,
  roleLabel,
  secondaryText,
  action,
}: WorkspaceMemberCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-card-bg px-3 py-2 transition-colors hover:bg-card-bg-active">
      <div className="flex min-w-0 flex-1 items-center gap-3 text-left">
        {avatar}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-sm text-text-primary">
            {name}
            {roleLabel ? (
              <span className="text-[10px] font-normal text-text-secondary">{roleLabel}</span>
            ) : null}
          </p>
          {secondaryText ? (
            <p className="truncate text-[11px] text-text-secondary">{secondaryText}</p>
          ) : null}
        </div>
      </div>
      {action}
    </div>
  );
}
