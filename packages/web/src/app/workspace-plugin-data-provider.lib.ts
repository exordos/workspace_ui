import { useMessengerStore } from "~/entities/messenger/messenger.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { useThemeStore } from "~/entities/theme/theme.model";
import type { PluginDataProvider } from "~/shared/lib/plugins/api";

export function createWorkspacePluginDataProvider(): PluginDataProvider {
  return {
    getCurrentUserId: () => useWorkspaceAuthStore.getState().getCurrentSession()?.userUuid ?? null,
    getStreams: () => {
      const session = useWorkspaceAuthStore.getState().getCurrentSession();
      if (session == null) return [];

      const ownerKey = workspaceRuntimeOwnerKey(session);
      const messengerState = useMessengerStore.getState();
      if (messengerState.ownerKey !== ownerKey) return [];

      return messengerState.streamIds.flatMap((streamUuid) => {
        const stream = messengerState.streamsById[streamUuid];
        if (stream == null) return [];
        return [
          {
            id: stream.uuid,
            name: stream.name,
            badge: stream.unreadCount,
          },
        ];
      });
    },
    getThemeMode: () => useThemeStore.getState().mode,
  };
}
