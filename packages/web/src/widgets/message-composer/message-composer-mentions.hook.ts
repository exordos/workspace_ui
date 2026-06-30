import { useEffect, useMemo, useState } from "react";
import { useUsersStore } from "~/entities/user/user.model";
import { filterUsers } from "~/features/mention-suggest/mention-suggest.lib";
import { useMentionSuggestStore } from "~/features/mention-suggest/mention-suggest.model";
import type { MentionSuggestion } from "~/features/mention-suggest/mention-suggest.types";

const EMPTY_USERS_MAP = new Map();
const EMPTY_MENTION_SUGGESTIONS: MentionSuggestion[] = [];

export function useComposerMentions(options: { enabled?: boolean } = {}) {
  // Mentions исторически читают старый users store, поэтому Workspace route может полностью выключить этот hook.
  const { enabled = true } = options;
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

  const allUsers = useUsersStore((s) => (enabled ? s.users : EMPTY_USERS_MAP));
  // При disabled возвращаем пустые данные, чтобы UI не дёргал Zulip-зависимые подсказки пользователей.
  const mentionUsers: MentionSuggestion[] = useMemo(
    () =>
      Array.from(allUsers.values()).map((u) => ({
        userId: u.user_id,
        fullName: u.full_name,
        email: u.email ?? "",
        avatarUrl: u.avatar_url ?? undefined,
      })),
    [allUsers],
  );

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
