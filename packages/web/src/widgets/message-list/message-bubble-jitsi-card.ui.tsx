import React, { useMemo } from "react";
import { type CallParticipant, useCallParticipantsStore } from "~/entities/call/call.model";
import { t } from "~/i18n/i18n";
import { Avatar } from "~/shared/ui/avatar";
import { Icon } from "~/shared/ui/icon";
import { formatJitsiRoomDisplayName, resolveJitsiLocationName } from "./message-jitsi-location.lib";
import type { MessageBubbleJitsiCardProps } from "./message-bubble-jitsi-card.types";

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

export const MessageBubbleJitsiCard = React.memo(function MessageBubbleJitsiCard({
  message,
  jitsiUrl,
  jitsiLinkOptions,
  isOwn,
  time,
  ownDeliveryIndicator,
  bubbleSurfaceClass,
  ownBubbleTailClass,
  peerBubbleTailClass,
  callbacks,
}: MessageBubbleJitsiCardProps) {
  const jitsiLocationName = resolveJitsiLocationName(message);
  const callParticipants = useCallParticipantsStore((s) =>
    jitsiUrl ? (s.participantsByUrl[jitsiUrl] ?? EMPTY_PARTICIPANTS) : EMPTY_PARTICIPANTS,
  );
  const jitsiCallName = useMemo(() => {
    const roomName = formatJitsiRoomDisplayName(jitsiUrl, jitsiLinkOptions);
    return roomName.length > 0 ? roomName : t("call.callName");
  }, [jitsiUrl, jitsiLinkOptions]);
  const jitsiTopicName = useMemo(() => {
    const topic = message.subject.trim();
    return topic.length > 0 ? topic : "";
  }, [message.subject]);
  const callParticipantNames = useMemo(() => {
    const names = callParticipants
      .map((participant) => participant.displayName.trim())
      .filter((name) => name.length > 0);
    if (names.length > 0) return names;
    const fallback = message.sender_full_name.trim();
    return fallback.length > 0 ? [fallback] : [];
  }, [callParticipants, message.sender_full_name]);
  const visibleCallParticipantNames = useMemo(
    () => callParticipantNames.slice(0, 3),
    [callParticipantNames],
  );
  const hiddenCallParticipantsCount = Math.max(
    callParticipantNames.length - visibleCallParticipantNames.length,
    0,
  );
  const participantBorderClass = isOwn ? "border-msg-own-bg" : "border-bg-elevated";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => callbacks?.onOpenJitsiCall?.(jitsiUrl, jitsiLocationName)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          callbacks?.onOpenJitsiCall?.(jitsiUrl, jitsiLocationName);
        }
      }}
      className={`relative flex cursor-pointer flex-col gap-2 px-3 py-2 ${bubbleSurfaceClass} ${
        isOwn
          ? `${ownBubbleTailClass} bg-msg-call-bg text-text-primary`
          : `${peerBubbleTailClass} bg-msg-call-bg text-text-primary`
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="shrink-0 text-[15px] font-semibold leading-tight text-call-green">
            {t("call.callMessage")}
          </span>
          <span className="truncate text-[15px] font-medium leading-tight text-text-primary">
            {jitsiCallName}
          </span>
          {jitsiTopicName.length > 0 && (
            <>
              <span className="h-4 w-1 shrink-0 rounded-full bg-accent" aria-hidden />
              <span className="truncate text-[15px] leading-tight text-text-muted">
                # {jitsiTopicName}
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
            data-testid={`jitsi-call-participants-${message.id}`}
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
        <div className="flex shrink-0 items-center gap-1 text-[11px] text-text-muted">
          <span>{time}</span>
          {ownDeliveryIndicator}
        </div>
      </div>
    </div>
  );
});
