import { useEffect, useMemo, useState } from "react";
import { useUsersStore } from "~/entities/user/user.model";
import { filterUsers } from "~/features/mention-suggest/mention-suggest.lib";
import { useMentionSuggestStore } from "~/features/mention-suggest/mention-suggest.model";
import type { MentionSuggestion } from "~/features/mention-suggest/mention-suggest.types";

export function useComposerMentions() {
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

  const allUsers = useUsersStore((s) => s.users);
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
    if (!showMentions) return;
    setMentionResults(filterUsers(mentionQuery, mentionUsers));
  }, [showMentions, mentionQuery, mentionUsers, setMentionResults]);

  useEffect(() => {
    if (!showMentions) {
      setActiveMentionIndex(0);
      return;
    }
    if (activeMentionIndex >= mentionSuggestions.length) {
      setActiveMentionIndex(0);
    }
  }, [showMentions, activeMentionIndex, mentionSuggestions.length]);

  useEffect(() => clearMentionState, [clearMentionState]);

  return {
    mentionQuery,
    mentionSuggestions,
    showMentions,
    setMentionQuery,
    showMentionDropdown,
    hideMentionDropdown,
    activeMentionIndex,
    setActiveMentionIndex,
    mentionStartPos,
    setMentionStartPos,
    mentionUsers,
  };
}
