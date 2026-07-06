/**
 * Types for chat page UI subcomponents.
 */
import type { MessengerUuid } from "~/entities/messenger/messenger.types";
import type { UserUuid } from "~/entities/user/user.types";

export interface ForwardWorkspaceStreamOption {
  streamUuid: MessengerUuid;
  name: string;
}

export interface ForwardWorkspaceTopicOption {
  streamUuid: MessengerUuid;
  topicUuid: MessengerUuid;
  name: string;
}

export type ForwardMessageTarget =
  | {
      kind: "topic";
      streamUuid: MessengerUuid;
      topicUuid: MessengerUuid;
    }
  | {
      kind: "direct";
      userUuid: UserUuid;
    };

export interface ForwardMessageModalBodyProps {
  streamOptions: ForwardWorkspaceStreamOption[];
  topicOptions: ForwardWorkspaceTopicOption[];
  currentUserUuid: UserUuid;
  isForwarding?: boolean;
  onForward: (target: ForwardMessageTarget) => void;
  onClose: () => void;
}
