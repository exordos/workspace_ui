import type { MentionSuggestion } from "~/features/mention-suggest/mention-suggest.types";

export interface ComposerMentionDropdownProps {
  suggestions: MentionSuggestion[];
  activeIndex: number;
  onSelect: (user: MentionSuggestion) => void;
  onHoverIndex: (index: number) => void;
}
