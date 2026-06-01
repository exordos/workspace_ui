import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { JitsiCallModal } from "~/features/jitsi-call/jitsi-call.ui";
import { t } from "~/i18n/i18n";
import { fetchAllMessagesPage } from "~/shared/api/zulip-messages";
import type { MockMessage } from "~/shared/api/zulip.types";
import { formatMessageTimeShort } from "~/shared/lib/datetime.lib";
import { getJitsiMeetingUrl, parseJitsiUrl, type JitsiLinkOptions } from "~/shared/lib/jitsi";
import { createLogger } from "~/shared/lib/logger";
import { buildNavigableRouteFromMessage } from "~/shared/lib/push-click";
import { Icon } from "~/shared/ui/icon";
import type { CallsRowProps, RecentJitsiCallEntry } from "./calls-page.types";

const log = createLogger("calls-page");
const CALLS_SCAN_LIMIT = 250;
const RECENT_CALLS_LIMIT = 20;
const CALLS_STATE_CARD_CLASS =
  "m-3 rounded-xl border border-border-subtle bg-bg-elevated/50 px-4 py-3 text-sm";
const CALLS_ROW_CLASS =
  "group flex items-start gap-2 rounded-xl border border-border-subtle bg-card-bg p-2.5 transition-colors hover:border-accent-soft/40 hover:bg-bg-elevated";
const CALLS_ACTION_BUTTON_CLASS =
  "rounded-md p-1.5 text-text-muted transition-colors hover:bg-card-bg-active hover:text-text-primary";

function resolveCallLocationName(message: MockMessage): string {
  if (message.stream_id != null) {
    if (typeof message.display_recipient === "string") {
      const streamName = message.display_recipient.trim();
      if (streamName.length > 0) return streamName;
    }

    const channelName = message.channel?.trim();
    if (channelName != null && channelName.length > 0) return channelName;
    return "";
  }

  if (!Array.isArray(message.display_recipient)) {
    return "";
  }

  const names = message.display_recipient
    .map((recipient) => recipient.full_name.trim())
    .filter((name) => name.length > 0);
  return names.join(", ");
}

function formatCallRoomLabel(
  meetingUrl: string,
  fallbackLabel: string,
  jitsiLinkOptions?: JitsiLinkOptions,
): string {
  const parsed = parseJitsiUrl(meetingUrl, jitsiLinkOptions);
  const roomName = parsed?.roomName?.trim();
  if (roomName == null || roomName.length === 0) {
    return fallbackLabel;
  }
  const prettyRoomName = roomName.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return prettyRoomName.length > 0 ? prettyRoomName : roomName;
}

function resolveCallContextLabel(
  message: MockMessage,
  locationName: string,
  dmFallbackLabel: string,
): string {
  if (message.stream_id != null) {
    const topic = message.subject.trim();
    if (locationName.length === 0) {
      return topic.length > 0 ? topic : dmFallbackLabel;
    }
    return topic.length > 0 ? `#${locationName} · ${topic}` : `#${locationName}`;
  }

  return locationName.length > 0 ? locationName : dmFallbackLabel;
}

function collectRecentJitsiCalls(
  messages: MockMessage[],
  options: {
    fallbackRoomLabel: string;
    dmFallbackLabel: string;
    jitsiLinkOptions?: JitsiLinkOptions;
  },
): RecentJitsiCallEntry[] {
  const entriesByUrl = new Map<string, RecentJitsiCallEntry>();
  const jitsiLinkOptions = options.jitsiLinkOptions;

  for (const message of messages) {
    const meetingUrl = getJitsiMeetingUrl(message.content, jitsiLinkOptions);
    if (!meetingUrl) continue;

    const locationName = resolveCallLocationName(message);
    const entry: RecentJitsiCallEntry = {
      id: message.id,
      meetingUrl,
      roomLabel: formatCallRoomLabel(meetingUrl, options.fallbackRoomLabel, jitsiLinkOptions),
      locationName,
      contextLabel: resolveCallContextLabel(message, locationName, options.dmFallbackLabel),
      message,
    };

    const existing = entriesByUrl.get(meetingUrl);
    if (
      existing == null ||
      message.timestamp > existing.message.timestamp ||
      (message.timestamp === existing.message.timestamp && message.id > existing.id)
    ) {
      entriesByUrl.set(meetingUrl, entry);
    }
  }

  return Array.from(entriesByUrl.values())
    .sort((left, right) => {
      if (left.message.timestamp !== right.message.timestamp) {
        return right.message.timestamp - left.message.timestamp;
      }
      return right.id - left.id;
    })
    .slice(0, RECENT_CALLS_LIMIT);
}

const CallsRow = React.memo<CallsRowProps>(({ entry, onJoin, onOpenInChat }) => {
  const joinCallLabel = t("call.joinCall");
  const openInChatLabel = t("message.openInChat");

  return (
    <li>
      <div className={CALLS_ROW_CLASS}>
        <button
          type="button"
          onClick={() => onJoin(entry)}
          className="min-w-0 flex-1 rounded-lg px-1 py-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft"
          title={joinCallLabel}
          aria-label={joinCallLabel}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-text-primary">
              {entry.roomLabel}
            </span>
            <span className="shrink-0 rounded-full bg-bg px-2 py-0.5 text-[10px] font-medium text-text-muted">
              {formatMessageTimeShort(entry.message.timestamp)}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-text-secondary">{entry.contextLabel}</p>
          <p className="mt-1 text-[11px] text-text-muted">{entry.message.sender_full_name}</p>
        </button>
        <div className="bg-bg/60 mt-0.5 flex shrink-0 items-center gap-1 rounded-lg p-1 opacity-70 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={() => onJoin(entry)}
            className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-on-accent transition-opacity hover:opacity-90"
            aria-label={joinCallLabel}
            title={joinCallLabel}
          >
            {joinCallLabel}
          </button>
          <button
            type="button"
            onClick={() => onOpenInChat(entry)}
            className={CALLS_ACTION_BUTTON_CLASS}
            aria-label={openInChatLabel}
            title={openInChatLabel}
          >
            <Icon name="newWindow" size={16} className="text-current" />
          </button>
        </div>
      </div>
    </li>
  );
});
CallsRow.displayName = "CallsRow";

export const CallsPage: React.FC = () => {
  const navigate = useNavigate();
  const currentUserId = useChatListStore((s) => s.currentUserId ?? null);
  const jitsiMeetBaseUrl = useInstancesStore((s) => s.jitsiMeetBaseUrl);
  const jitsiLinkOptions = useMemo<JitsiLinkOptions>(
    () => ({ serverBaseUrl: jitsiMeetBaseUrl }),
    [jitsiMeetBaseUrl],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentCalls, setRecentCalls] = useState<RecentJitsiCallEntry[]>([]);
  const [activeCall, setActiveCall] = useState<RecentJitsiCallEntry | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void fetchAllMessagesPage("newest", CALLS_SCAN_LIMIT)
      .then((page) => {
        if (cancelled) return;
        setRecentCalls(
          collectRecentJitsiCalls(page.messages, {
            fallbackRoomLabel: t("call.call"),
            dmFallbackLabel: t("dm.private"),
            jitsiLinkOptions,
          }),
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setError(String(err));
        log.error("Failed to load recent jitsi calls", { error: String(err) });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [jitsiLinkOptions, t]);

  const handleJoinCall = useCallback((entry: RecentJitsiCallEntry) => {
    setActiveCall(entry);
  }, []);

  const handleOpenInChat = useCallback(
    (entry: RecentJitsiCallEntry) => {
      const route = buildNavigableRouteFromMessage(entry.message, currentUserId);
      if (!route) return;
      void navigate(route);
    },
    [navigate, currentUserId],
  );

  const handleCloseCallModal = useCallback(() => {
    setActiveCall(null);
  }, []);

  const callsTitle = t("call.recentCalls");

  return (
    <div className="flex max-h-full min-h-0 min-w-0 max-w-narrow-page flex-1 flex-col overflow-hidden">
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-4 pb-2 pt-3">
          <Icon name="phone" size={18} className="text-text-muted" />
          <h2 className="text-sm font-semibold text-text-primary">{callsTitle}</h2>
        </div>
        {loading && (
          <div className={`${CALLS_STATE_CARD_CLASS} text-text-muted`}>{t("app.loading")}</div>
        )}
        {!loading && error && (
          <div className={`${CALLS_STATE_CARD_CLASS} text-notice-base`}>
            {t("call.loadRecentCallsError")}
          </div>
        )}
        {!loading && !error && recentCalls.length === 0 && (
          <div className={`${CALLS_STATE_CARD_CLASS} text-text-muted`}>
            {t("call.noRecentCalls")}
          </div>
        )}
        {!loading && !error && recentCalls.length > 0 && (
          <ul className="flex flex-1 flex-col space-y-2 overflow-auto px-3 pb-3 pt-1">
            {recentCalls.map((entry) => (
              <CallsRow
                key={entry.meetingUrl}
                entry={entry}
                onJoin={handleJoinCall}
                onOpenInChat={handleOpenInChat}
              />
            ))}
          </ul>
        )}
      </section>

      {activeCall && (
        <JitsiCallModal
          open={true}
          meetingUrl={activeCall.meetingUrl}
          locationName={activeCall.locationName}
          onClose={handleCloseCallModal}
        />
      )}
    </div>
  );
};
