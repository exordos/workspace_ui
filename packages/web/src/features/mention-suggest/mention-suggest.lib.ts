/**
 * Mention suggestion filtering — pure function for matching users against a query.
 *
 * Matches against Workspace UUID, username, display name, and email.
 */

import type { MentionSuggestion } from "./mention-suggest.types";

export function filterUsers(
  query: string,
  users: MentionSuggestion[],
  maxResults?: number,
): MentionSuggestion[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) return limitResults(users, maxResults);

  const lower = trimmed.toLowerCase();

  const uuidMatches: MentionSuggestion[] = [];
  const usernameMatches: MentionSuggestion[] = [];
  const displayNameMatches: MentionSuggestion[] = [];
  const emailOnlyMatches: MentionSuggestion[] = [];

  for (const user of users) {
    const uuidMatch = user.userUuid.toLowerCase().includes(lower);
    const usernameMatch = user.username.toLowerCase().includes(lower);
    const displayNameMatch = user.displayName.toLowerCase().includes(lower);
    const emailMatch = user.email.toLowerCase().includes(lower);

    if (uuidMatch) {
      uuidMatches.push(user);
    } else if (usernameMatch) {
      usernameMatches.push(user);
    } else if (displayNameMatch) {
      displayNameMatches.push(user);
    } else if (emailMatch) {
      emailOnlyMatches.push(user);
    }
  }

  return limitResults(
    [...uuidMatches, ...usernameMatches, ...displayNameMatches, ...emailOnlyMatches],
    maxResults,
  );
}

function limitResults(
  users: MentionSuggestion[],
  maxResults: number | undefined,
): MentionSuggestion[] {
  if (maxResults == null) return users;
  return users.slice(0, Math.max(0, maxResults));
}
