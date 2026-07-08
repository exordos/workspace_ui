import React, { useCallback, useMemo } from "react";
import { type CallParticipant, useCallParticipantsStore } from "~/entities/call/call.model";
import { t } from "~/i18n/i18n";
import { parseJitsiUrl, type JitsiLinkOptions } from "~/shared/lib/jitsi";
import { Avatar } from "~/shared/ui/avatar";
import { Icon } from "~/shared/ui/icon";
import { WorkspaceMessageBubbleMeta } from "./workspace-message-bubble-meta.ui";

interface WorkspaceMessageBubbleJitsiCardProps {
  messageKey: string;
  authorLabel: string;
  jitsiUrl: string;
  jitsiLinkOptions?: JitsiLinkOptions;
  locationName?: string | null;
  isOwn: boolean;
  time: string;
  createdAt: string;
  deliveryIndicator?: React.ReactNode;
  onOpenJitsiCall?: (url: string, locationName?: string) => void;
}

const EMPTY_PARTICIPANTS: CallParticipant[] = [];

function getAvatarInitials(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "?";

  const parts = trimmed.split(/\s+/).filter((part) => part.length > 0);
  const first = parts[0]?.[0] ?? "";
  const second = parts[1]?.[0] ?? "";
  const initials = `${first}${second}`.toUpperCase();

  return initials.length > 0 ? initials : "?";
}

function formatWorkspaceJitsiRoomDisplayName(jitsiUrl: string, options?: JitsiLinkOptions): string {
  const parsed = parseJitsiUrl(jitsiUrl, options);
  const roomName = parsed?.roomName?.trim() ?? "";
  return roomName.length === 0 ? "" : roomName.replace(/[-_]+/g, " ").trim();
}

export const WorkspaceMessageBubbleJitsiCard = React.memo(function WorkspaceMessageBubbleJitsiCard({
  messageKey,
  authorLabel,
  jitsiUrl,
  jitsiLinkOptions,
  locationName,
  isOwn,
  time,
  createdAt,
  deliveryIndicator = null,
  onOpenJitsiCall,
}: WorkspaceMessageBubbleJitsiCardProps): React.ReactElement {
  const callParticipants = useCallParticipantsStore((state) =>
    jitsiUrl ? (state.participantsByUrl[jitsiUrl] ?? EMPTY_PARTICIPANTS) : EMPTY_PARTICIPANTS,
  );
  const jitsiCallName = useMemo(() => {
    const roomName = formatWorkspaceJitsiRoomDisplayName(jitsiUrl, jitsiLinkOptions);
    return roomName.length > 0 ? roomName : t("call.callName");
  }, [jitsiLinkOptions, jitsiUrl]);
  const jitsiLocationName = useMemo(() => locationName?.trim() ?? "", [locationName]);
  const callParticipantNames = useMemo(() => {
    const names = callParticipants
      .map((participant) => participant.displayName.trim())
      .filter((name) => name.length > 0);
    if (names.length > 0) return names;

    const fallback = authorLabel.trim();
    return fallback.length > 0 ? [fallback] : [];
  }, [authorLabel, callParticipants]);
  const visibleCallParticipantNames = useMemo(
    () => callParticipantNames.slice(0, 3),
    [callParticipantNames],
  );
  const hiddenCallParticipantsCount = Math.max(
    callParticipantNames.length - visibleCallParticipantNames.length,
    0,
  );
  const participantBorderClass = isOwn ? "border-msg-own-bg" : "border-bg-elevated";
  const handleOpen = useCallback(() => {
    onOpenJitsiCall?.(jitsiUrl, jitsiLocationName);
  }, [jitsiLocationName, jitsiUrl, onOpenJitsiCall]);
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      handleOpen();
    },
    [handleOpen],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={handleKeyDown}
      className="relative flex cursor-pointer flex-col gap-2 outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
      aria-label={t("call.joinCall")}
      data-workspace-jitsi-card="true"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="shrink-0 text-[15px] font-semibold leading-tight text-call-green">
            {t("call.callMessage")}
          </span>
          <span className="truncate text-[15px] font-medium leading-tight text-text-primary">
            {jitsiCallName}
          </span>
          {jitsiLocationName.length > 0 && (
            <>
              <span className="h-4 w-1 shrink-0 rounded-full bg-accent" aria-hidden />
              <span className="truncate text-[15px] leading-tight text-text-muted">
                {jitsiLocationName}
              </span>
            </>
          )}
        </div>
        <Icon name="phone" size={18} className="mt-0.5 shrink-0 text-call-green" />
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 text-text-muted">
          <Icon name="chevron-right" size={12} className="shrink-0 rotate-45 text-current" />
          <div
            data-testid={`workspace-jitsi-call-participants-${messageKey}`}
            className="ml-0.5 flex min-w-0 items-center -space-x-2"
          >
            {visibleCallParticipantNames.map((participantName, idx) => (
              <Avatar
                key={`${participantName}-${idx}`}
                size="sm"
                className={`border-2 ${participantBorderClass} bg-bg text-[10px]`}
              >
                {getAvatarInitials(participantName)}
              </Avatar>
            ))}
            {hiddenCallParticipantsCount > 0 && (
              <span
                className={`inline-flex h-8 w-8 items-center justify-center rounded-full border-2 ${participantBorderClass} bg-bg text-[10px] font-semibold text-text-primary`}
              >
                +{hiddenCallParticipantsCount}
              </span>
            )}
          </div>
        </div>
        <WorkspaceMessageBubbleMeta
          time={time}
          createdAt={createdAt}
          placement="row"
          className="shrink-0"
          after={deliveryIndicator}
        />
      </div>
    </div>
  );
});
