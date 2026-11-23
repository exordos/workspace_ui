import { useId } from "react";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import { WorkspaceMessageDivider } from "./workspace-message-divider.ui";
import type { WorkspaceServiceGroupStatus } from "./workspace-service-message-group.lib";
import type { ReactNode } from "react";

interface WorkspaceServiceMessageGroupProps {
  count: number;
  expanded: boolean;
  status: WorkspaceServiceGroupStatus;
  onToggle: () => void;
  toggleDisabled?: boolean;
  children: ReactNode;
}

const STATUS_LABEL_KEYS = {
  "action-required": "chat.serviceEventsActionRequired",
  waiting: "chat.serviceEventsWaiting",
  unavailable: "chat.serviceEventsUnavailable",
} as const;

export function WorkspaceServiceMessageGroup({
  count,
  expanded,
  status,
  onToggle,
  toggleDisabled,
  children,
}: Readonly<WorkspaceServiceMessageGroupProps>) {
  const contentId = useId();
  return (
    <div className="relative w-full" data-service-message-group="true">
      <WorkspaceMessageDivider
        tone={status === "action-required" ? "notice" : "muted"}
        className="relative z-[1]"
      >
        <button
          type="button"
          className="flex min-h-7 min-w-0 items-center justify-center gap-3 rounded-sm px-1 text-inherit hover:bg-card-bg-active focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-soft"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={onToggle}
          disabled={toggleDisabled}
        >
          <Icon
            name="chevron-down"
            size={12}
            className={expanded ? "shrink-0" : "shrink-0 -rotate-90"}
          />
          <span className="flex min-w-0 items-center gap-1">
            <span>{t("chat.serviceEvents", { count })}</span>
            {status != null ? <span role="status">· {t(STATUS_LABEL_KEYS[status])}</span> : null}
          </span>
        </button>
      </WorkspaceMessageDivider>
      <div id={contentId} className={expanded ? "flex flex-col items-center gap-1" : "contents"}>
        {children}
      </div>
    </div>
  );
}
