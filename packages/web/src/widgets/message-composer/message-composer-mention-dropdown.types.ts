import type { MentionSuggestion } from "~/features/mention-suggest/mention-suggest.types";
import type { WorkspaceComposerReference } from "./message-composer-reference.lib";

export type ComposerSuggestion = MentionSuggestion | WorkspaceComposerReference;

export interface ComposerMentionDropdownProps {
  suggestions: ComposerSuggestion[];
  activeIndex: number;
  listboxId: string;
  onSelect: (suggestion: ComposerSuggestion) => void;
  onHoverIndex: (index: number) => void;
}
