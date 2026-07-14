import type { ComposerSendNewlineMode } from "./message-composer-input-commands.lib";
import type { ComposerSuggestion } from "./message-composer-mention-dropdown.types";
import type { ClipboardEvent, Dispatch, RefObject, SetStateAction } from "react";

export interface MessageComposerWriteBodyProps {
  value: string;
  placeholder: string;
  disabled: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  textareaId: string;
  showMentions: boolean;
  mentionSuggestions: ComposerSuggestion[];
  activeMentionIndex: number;
  onActiveMentionIndexChange: Dispatch<SetStateAction<number>>;
  onMentionSelect: (suggestion: ComposerSuggestion) => void;
  onHideMentionDropdown: () => void;
  onValueChange: (next: string) => void;
  onDetectMention: (text: string, cursorPosition: number) => void;
  applyFormattingShortcut: (delimiter: string) => void;
  onPaste: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void | Promise<void>;
  sendNewlineMode: ComposerSendNewlineMode;
  onEditLastMessage?: () => void;
  isEditing?: boolean;
  onCancelEdit?: () => void;
}
