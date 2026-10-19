import { useMemo, useSyncExternalStore } from "react";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { useMessengerStore, type MessengerStoreState } from "~/entities/messenger/messenger.model";
import { useUsersStore } from "~/entities/user/user.model";
import type { UsersById } from "~/entities/user/user.types";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import {
  isWorkspaceRuntimeRequestContextCurrent,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";

const PROJECTION_INTERVAL_MS = 100;
const CATALOG_FIELDS = [
  "ownerKey",
  "bootstrapRequestVersion",
  "isLoading",
  "error",
  "lastLoadedAt",
  "streamIds",
  "streamsById",
  "topicIds",
  "topicsById",
  "folderIds",
  "foldersById",
  "conversationsById",
] as const;

interface SidebarProjectionSnapshot {
  messenger: MessengerStoreState;
  messagesById: ReturnType<typeof useWorkspaceMessageStore.getState>["messagesById"];
  usersById: UsersById;
}

function createSidebarProjectionSubscription(runtime: WorkspaceRuntimeContext | null) {
  const expectedOwner = runtime == null ? null : workspaceRuntimeOwnerKey(runtime);
  const emptyMessenger = {
    ...useMessengerStore.getInitialState(),
    ownerKey: expectedOwner,
    isLoading: runtime != null,
  };
  const emptyMessages = useWorkspaceMessageStore.getInitialState().messagesById;
  const emptyUsers = useUsersStore.getInitialState().usersById;
  let cached: SidebarProjectionSnapshot | undefined;
  const isRuntimeCurrent = () =>
    runtime == null
      ? useWorkspaceAuthStore.getState().getCurrentRuntimeContext() == null
      : isWorkspaceRuntimeRequestContextCurrent(runtime, () =>
          useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
        );

  const readSnapshot = (): SidebarProjectionSnapshot => {
    const current = useMessengerStore.getState();
    const valid = isRuntimeCurrent() && current.ownerKey === expectedOwner;
    const messenger = valid ? current : emptyMessenger;
    const messages = useWorkspaceMessageStore.getState();
    const users = useUsersStore.getState();
    const messagesById =
      valid && messages.ownerKey === messenger.ownerKey ? messages.messagesById : emptyMessages;
    const usersById = valid && users.ownerKey === messenger.ownerKey ? users.usersById : emptyUsers;
    if (
      cached?.messagesById === messagesById &&
      cached.usersById === usersById &&
      CATALOG_FIELDS.every((field) => cached?.messenger[field] === messenger[field])
    )
      return cached;
    cached = { messenger, messagesById, usersById };
    return cached;
  };

  let published = readSnapshot();
  const getSnapshot = (): SidebarProjectionSnapshot => {
    const current = useMessengerStore.getState();
    if (
      !isRuntimeCurrent() ||
      current.ownerKey !== published.messenger.ownerKey ||
      current.bootstrapRequestVersion !== published.messenger.bootstrapRequestVersion ||
      current.isLoading !== published.messenger.isLoading ||
      current.error !== published.messenger.error
    ) {
      published = readSnapshot();
    }
    return published;
  };

  const subscribe = (listener: () => void): (() => void) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    let interactionPending = false;
    const visible = () => typeof document === "undefined" || document.visibilityState !== "hidden";
    const cancel = () => {
      if (timer != null) clearTimeout(timer);
      timer = null;
    };
    const flush = () => {
      cancel();
      if (closed) return;
      published = readSnapshot();
      listener();
    };
    const changed = (urgent = false) => {
      if (closed || readSnapshot() === published) return;
      if (urgent || !isRuntimeCurrent()) {
        flush();
        return;
      }
      if (!visible() || timer != null) return;
      timer = setTimeout(() => {
        timer = null;
        if (visible()) flush();
      }, PROJECTION_INTERVAL_MS);
    };
    const unsubscribers = [
      useMessengerStore.subscribe((state, previous) =>
        changed(
          state.ownerKey !== previous.ownerKey ||
            state.bootstrapRequestVersion !== previous.bootstrapRequestVersion ||
            state.isLoading !== previous.isLoading ||
            state.error !== previous.error,
        ),
      ),
      useWorkspaceMessageStore.subscribe((state, previous) =>
        changed(state.ownerKey !== previous.ownerKey),
      ),
      useUsersStore.subscribe((state, previous) => changed(state.ownerKey !== previous.ownerKey)),
    ];
    const onVisibility = () => {
      if (visible()) flush();
      else cancel();
    };
    const onInteraction = () => {
      if (interactionPending) return;
      interactionPending = true;
      // React and native event handlers must finish their synchronous store writes first.
      queueMicrotask(() => {
        interactionPending = false;
        if (!closed && visible()) flush();
      });
    };
    const interactions = ["click", "keydown", "input"] as const;
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
      for (const event of interactions) document.addEventListener(event, onInteraction);
    }
    if (readSnapshot() !== published) flush();
    return () => {
      closed = true;
      cancel();
      for (const unsubscribe of unsubscribers) unsubscribe();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
        for (const event of interactions) document.removeEventListener(event, onInteraction);
      }
    };
  };
  return { getSnapshot, subscribe };
}

/** Coalesce presentation work; canonical stores and persistence still apply every event. */
export function useSidebarProjectionSnapshot(
  runtime: WorkspaceRuntimeContext | null,
  refreshKey = "",
): SidebarProjectionSnapshot {
  // A view selection change must publish the latest snapshot immediately.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const source = useMemo(() => createSidebarProjectionSubscription(runtime), [runtime, refreshKey]);
  return useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);
}
