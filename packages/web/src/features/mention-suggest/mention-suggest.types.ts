/**
 * Mention Suggestions type definitions.
 *
 * Powers the @mention autocomplete dropdown in the message composer.
 * Filters users from the users store by matching query against Workspace user fields.
 */

import type { UserPresenceStatus } from "~/entities/user/user.types";

export interface MentionSuggestion {
  userUuid: string;
  displayName: string;
  username: string;
  email: string;
  status: UserPresenceStatus | null;
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
