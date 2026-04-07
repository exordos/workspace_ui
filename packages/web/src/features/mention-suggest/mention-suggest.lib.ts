/**
 * Mention suggestion filtering — pure function for matching users against a query.
 *
 * Matches against fullName and email (case-insensitive). Returns up to
 * maxResults matches, prioritizing name matches over email-only matches.
 */

import type { MentionSuggestion } from "./mention-suggest.types";

const DEFAULT_MAX_RESULTS = 10;

export function filterUsers(
  query: string,
  users: MentionSuggestion[],
  maxResults = DEFAULT_MAX_RESULTS,
): MentionSuggestion[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) return users.slice(0, maxResults);

  const lower = trimmed.toLowerCase();

  const nameMatches: MentionSuggestion[] = [];
  const emailOnlyMatches: MentionSuggestion[] = [];

  for (const user of users) {
    const nameMatch = user.fullName.toLowerCase().includes(lower);
    const emailMatch = user.email.toLowerCase().includes(lower);

    if (nameMatch) {
      nameMatches.push(user);
    } else if (emailMatch) {
      emailOnlyMatches.push(user);
    }
  }

  return [...nameMatches, ...emailOnlyMatches].slice(0, maxResults);
}
