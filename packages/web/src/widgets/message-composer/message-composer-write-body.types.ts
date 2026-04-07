import type {
  ClipboardEvent,
  Dispatch,
  RefObject,
  SetStateAction,
} from "react";
import type { MentionSuggestion } from "~/features/mention-suggest/mention-suggest.types";

export interface MessageComposerWriteBodyProps {
  value: string;
  placeholder: string;
  disabled: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  showMentions: boolean;
  mentionSuggestions: MentionSuggestion[];
  activeMentionIndex: number;
  onActiveMentionIndexChange: Dispatch<SetStateAction<number>>;
  onMentionSelect: (suggestion: MentionSuggestion) => void;
  onHideMentionDropdown: () => void;
  onValueChange: (next: string) => void;
  onDetectMention: (text: string, cursorPosition: number) => void;
  applyFormattingShortcut: (delimiter: string) => void;
  onPaste: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void | Promise<void>;
  onEditLastMessage?: () => void;
}
