import { useEffect, useMemo, useState } from "react";
import { selectUserDisplayName } from "~/entities/user/user-selectors.lib";
import { useUsersStore } from "~/entities/user/user.model";
import { filterUsers } from "~/features/mention-suggest/mention-suggest.lib";
import { useMentionSuggestStore } from "~/features/mention-suggest/mention-suggest.model";
import type { MentionSuggestion } from "~/features/mention-suggest/mention-suggest.types";

const EMPTY_MENTION_SUGGESTIONS: MentionSuggestion[] = [];

export function useComposerMentions(options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  const userIds = useUsersStore((s) => s.userIds);
  const usersById = useUsersStore((s) => s.usersById);
  const mentionQuery = useMentionSuggestStore((s) => s.query);
  const mentionSuggestions = useMentionSuggestStore((s) => s.results);
  const showMentions = useMentionSuggestStore((s) => s.visible);
  const setMentionQuery = useMentionSuggestStore((s) => s.setQuery);
  const setMentionResults = useMentionSuggestStore((s) => s.setResults);
  const showMentionDropdown = useMentionSuggestStore((s) => s.show);
  const hideMentionDropdown = useMentionSuggestStore((s) => s.hide);
  const clearMentionState = useMentionSuggestStore((s) => s.clear);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [mentionStartPos, setMentionStartPos] = useState(0);

  const mentionUsers: MentionSuggestion[] = useMemo(() => {
    const suggestions: MentionSuggestion[] = [];

    userIds.forEach((userUuid) => {
      const user = usersById[userUuid];
      if (user == null) return;

      suggestions.push({
        userUuid: user.uuid,
        displayName: selectUserDisplayName(user, user.uuid),
        username: user.username,
        email: user.email ?? "",
        status: user.status ?? null,
        ...(user.avatarUrl != null ? { avatarUrl: user.avatarUrl } : {}),
      });
    });

    return suggestions;
  }, [userIds, usersById]);

  useEffect(() => {
    if (!enabled) {
      clearMentionState();
      return;
    }
    if (!showMentions) return;
    setMentionResults(filterUsers(mentionQuery, mentionUsers));
  }, [clearMentionState, enabled, showMentions, mentionQuery, mentionUsers, setMentionResults]);

  useEffect(() => {
    if (!enabled || !showMentions) {
      setActiveMentionIndex(0);
      return;
    }
    if (activeMentionIndex >= mentionSuggestions.length) {
      setActiveMentionIndex(0);
    }
  }, [enabled, showMentions, activeMentionIndex, mentionSuggestions.length]);

  useEffect(() => clearMentionState, [clearMentionState]);

  return {
    mentionQuery,
    mentionSuggestions: enabled ? mentionSuggestions : EMPTY_MENTION_SUGGESTIONS,
    showMentions: enabled ? showMentions : false,
    setMentionQuery,
    showMentionDropdown,
    hideMentionDropdown,
    activeMentionIndex,
    setActiveMentionIndex,
    mentionStartPos,
    setMentionStartPos,
    mentionUsers: enabled ? mentionUsers : EMPTY_MENTION_SUGGESTIONS,
  };
}
