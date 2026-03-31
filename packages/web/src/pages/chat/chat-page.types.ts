/**
 * Types for chat page UI subcomponents.
 */
import type { StreamWithLast } from "~/widgets/sidebar/sidebar.types";

export interface EditMessageModalBodyProps {
  initialContent: string;
  onSave: (content: string) => void;
  onClose: () => void;
}

export interface ForwardMessageModalBodyProps {
  streams: StreamWithLast[];
  onForward: (stream: string, topic: string, to?: number[]) => void;
  onClose: () => void;
}
