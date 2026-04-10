/**
 * Types for chat page UI subcomponents.
 */
import type { MockMessage } from "~/shared/api/zulip.types";
import type { StreamWithLast } from "~/widgets/sidebar/sidebar.types";

export interface EditMessageModalBodyProps {
  message: MockMessage;
  onSave: (markdown: string) => void;
  onClose: () => void;
}

export interface ForwardMessageModalBodyProps {
  streams: StreamWithLast[];
  onForward: (stream: string, topic: string, to?: number[]) => void;
  onClose: () => void;
}
