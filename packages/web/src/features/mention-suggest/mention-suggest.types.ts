/**
 * Mention Suggestions type definitions.
 *
 * Powers the @mention autocomplete dropdown in the message composer.
 * Filters users from the users store by matching query against name and email.
 */

export interface MentionSuggestion {
  userId: number;
  fullName: string;
  email: string;
  avatarUrl?: string;
}

export interface MentionSuggestState {
  query: string;
  results: MentionSuggestion[];
  visible: boolean;

  setQuery: (query: string) => void;
  setResults: (results: MentionSuggestion[]) => void;
  show: () => void;
  hide: () => void;
  clear: () => void;
}
