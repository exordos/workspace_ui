/**
 * Types for chat page UI subcomponents.
 */
import type { StreamWithLast } from "~/widgets/sidebar/sidebar.types";
export interface ForwardMessageModalBodyProps {
  streams: StreamWithLast[];
  onForward: (stream: string, topic: string, to?: number[]) => void;
  onClose: () => void;
}
