import type {
  MessengerMessage,
  MessengerStream,
  MessengerTopic,
} from "~/entities/messenger/messenger.types";
import { FloatingLoadingOverlay } from "~/shared/ui/floating-loading-overlay";
import { ActivityMessageCard } from "./activity-message-card.ui";
import type { RefObject, UIEventHandler } from "react";

interface ActivityMessageListProps {
  messages: readonly MessengerMessage[];
  streamsById: Readonly<Record<string, MessengerStream>>;
  topicsById: Readonly<Record<string, MessengerTopic>>;
  listRef: RefObject<HTMLUListElement | null>;
  onScroll: UIEventHandler<HTMLUListElement>;
  onOpen: (message: MessengerMessage) => void;
  onForward: (messageUuid: string) => void;
  isLoading: boolean;
}

export function ActivityMessageList({
  messages,
  streamsById,
  topicsById,
  listRef,
  onScroll,
  onOpen,
  onForward,
  isLoading,
}: Readonly<ActivityMessageListProps>) {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <ul
        ref={listRef}
        onScroll={onScroll}
        className="flex min-h-0 flex-1 flex-col space-y-1 overflow-auto scroll-auto p-2"
      >
        {messages.map((message) => (
          <li key={message.uuid}>
            <ActivityMessageCard
              message={message}
              stream={streamsById[message.streamUuid]}
              topic={topicsById[message.topicUuid]}
              onOpen={onOpen}
              onForward={onForward}
            />
          </li>
        ))}
      </ul>
      <FloatingLoadingOverlay visible={isLoading} />
    </div>
  );
}
