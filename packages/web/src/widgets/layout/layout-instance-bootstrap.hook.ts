import { useCallback, useEffect } from "react";
import { useMuteStore } from "~/features/mute-chat/mute-chat.model";
import { fetchSubscriptions, fetchUserTopics } from "~/shared/api/zulip";

export interface LayoutMuteSnapshot {
  mutedStreamIds: number[];
  mutedTopics: { streamId: number; topic: string }[];
  unmutedTopics: { streamId: number; topic: string }[];
}

export function useLayoutInstanceBootstrap(options: {
  currentInstanceId: string | null;
  currentUserStatus: "idle" | "loading" | "ready" | "error";
}): {
  loadMuteSnapshot: () => Promise<LayoutMuteSnapshot>;
} {
  const { currentInstanceId, currentUserStatus } = options;

  const loadMuteSnapshot = useCallback(async (): Promise<LayoutMuteSnapshot> => {
    const [subs, userTopics] = await Promise.all([fetchSubscriptions(), fetchUserTopics()]);
    const mutedStreamIds = subs.filter((s) => s.is_muted).map((s) => s.stream_id);
    const mutedTopics: { streamId: number; topic: string }[] = [];
    const unmutedTopics: { streamId: number; topic: string }[] = [];
    for (const ut of userTopics) {
      if (ut.visibility_policy === 1) {
        mutedTopics.push({ streamId: ut.stream_id, topic: ut.topic_name });
      } else if (ut.visibility_policy === 2) {
        unmutedTopics.push({ streamId: ut.stream_id, topic: ut.topic_name });
      }
    }
    return { mutedStreamIds, mutedTopics, unmutedTopics };
  }, []);

  useEffect(() => {
    if (!currentInstanceId || currentUserStatus !== "ready") return;
    let cancelled = false;

    loadMuteSnapshot()
      .then((snapshot) => {
        if (!cancelled) {
          useMuteStore.getState().setFromServer(snapshot);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [currentInstanceId, currentUserStatus, loadMuteSnapshot]);

  return { loadMuteSnapshot };
}

