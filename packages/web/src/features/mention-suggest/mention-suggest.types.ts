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
  /** True when channel membership is known and this person is not a member of it. */
  outsideChannel?: boolean;
}

/**
 * Conversation signals that decide who is offered first among equally good matches.
 * Every field is optional: without them ranking falls back to match quality and name order.
 */
export interface MentionRankingContext {
  /** The composing user, ranked last so that self-mentions never take the first slot. */
  selfUserUuid?: string | null;
  /** Members of the stream being composed in; null while membership is still unknown. */
  channelMemberUuids?: ReadonlySet<string> | null;
  /** Authors of the open conversation, most recent first. */
  recentAuthorUuids?: readonly string[];
  /** Direct message partners, most recently active first. */
  dmPartnerUuids?: readonly string[];
  /** Decayed count of how often this user was picked from the dropdown before. */
  frecencyByUserUuid?: Readonly<Record<string, number>>;
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
