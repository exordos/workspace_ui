import type {
  MessengerMessage,
  MessengerStream,
  MessengerTopic,
} from "~/entities/messenger/messenger.types";
import { selectUserDisplayName } from "~/entities/user/user-selectors.lib";
import { useUsersStore } from "~/entities/user/user.model";
import { t } from "~/i18n/i18n";
import { formatActivityItemTime } from "~/shared/lib/datetime.lib";
import type { WorkspaceMessageSummaryOptions } from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import { summarizeWorkspaceMessageMarkdown } from "~/shared/lib/workspace-message-render/workspace-message-summary.lib";
import { Icon } from "~/shared/ui/icon";

const ACTIVITY_MESSAGE_SUMMARY_OPTIONS = {
  maxLength: 80,
  includeMediaLabel: true,
  includeAttachmentLabel: true,
  includeQuotePrefix: true,
} as const satisfies WorkspaceMessageSummaryOptions;

function formatWorkspaceItemTime(createdAt: string): string {
  const parsed = Date.parse(createdAt);
  if (Number.isNaN(parsed)) return "";
  return formatActivityItemTime(Math.floor(parsed / 1000));
}

function ActivityMessageSenderName({
  authorUuid,
}: Readonly<{
  authorUuid: string;
}>) {
  const user = useUsersStore((state) => state.usersById[authorUuid]);
  return <>{selectUserDisplayName(user, "")}</>;
}

export interface ActivityMessageCardProps {
  message: MessengerMessage;
  stream?: MessengerStream;
  topic?: MessengerTopic;
  onOpen: (message: MessengerMessage) => void;
  onForward: (messageUuid: string) => void;
}

export function ActivityMessageCard({
  message,
  stream,
  topic,
  onOpen,
  onForward,
}: Readonly<ActivityMessageCardProps>) {
  const streamName = stream?.name.trim() ?? "";
  const topicName = topic?.name.trim() ?? "";
  const isPrivate = stream?.isPrivate ?? false;
  const privateContext =
    isPrivate && streamName.length > 0 ? `${t("dm.private")} · ${streamName}` : null;
  const preview = summarizeWorkspaceMessageMarkdown(
    message.payload.content,
    ACTIVITY_MESSAGE_SUMMARY_OPTIONS,
  ).text;

  return (
    <div className="group flex items-start gap-2 rounded-lg p-3 transition-colors hover:bg-card-bg">
      <button type="button" onClick={() => onOpen(message)} className="min-w-0 flex-1 text-left">
        <div className="flex items-start justify-between gap-2">
          <span className="shrink-0 text-[11px] text-text-muted">
            {formatWorkspaceItemTime(message.createdAt)}
          </span>
          {streamName.length > 0 && !isPrivate ? (
            <span className="truncate text-[11px] text-text-muted">
              <span>{`#${streamName}`}</span>
              {topicName.length > 0 ? <span>{` · ${topicName}`}</span> : null}
            </span>
          ) : null}
          {privateContext != null ? (
            <span className="truncate text-[11px] text-text-muted">{privateContext}</span>
          ) : null}
        </div>
        <p className="mt-0.5 text-xs text-sidebar-sender">
          <ActivityMessageSenderName authorUuid={message.authorUuid} />
        </p>
        <p className="mt-1 line-clamp-2 text-sm text-text-primary">{preview}</p>
      </button>
      <div className="mt-0.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={() => onOpen(message)}
          className="hover:bg-bg-elevated/70 rounded p-1 text-text-muted hover:text-text-primary"
          aria-label={t("message.openInChat")}
          title={t("message.openInChat")}
        >
          <Icon name="newWindow" size={16} className="text-current" />
        </button>
        <button
          type="button"
          onClick={() => onForward(message.uuid)}
          className="hover:bg-bg-elevated/70 rounded p-1 text-text-muted hover:text-text-primary"
          aria-label={t("message.forward")}
          title={t("message.forward")}
        >
          <Icon name="send" size={16} className="text-current" />
        </button>
      </div>
    </div>
  );
}
