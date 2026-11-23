import { useMemo, useSyncExternalStore } from "react";
import {
  EMPTY_CHATS_CATALOG,
  createChatsCatalogSource,
  type ChatsCatalogSnapshot,
} from "~/applications/messenger/model/chats/chats";
import {
  createMessagesIndexSource,
  type MessagesIndexSnapshot,
} from "~/applications/messenger/model/messages/messages-consumers";
import { useUsersStore } from "~/entities/user/user.model";
import type { UsersById } from "~/entities/user/user.types";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import {
  isWorkspaceRuntimeRequestContextCurrent,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { isTabVisible, onVisibilityChange } from "~/shared/lib/visibility";

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
  "conversationIds",
] as const;

interface SidebarProjectionSnapshot {
  messenger: Pick<ChatsCatalogSnapshot, (typeof CATALOG_FIELDS)[number]>;
  messagesById: MessagesIndexSnapshot["messagesById"];
  usersById: UsersById;
}
const EMPTY_SIDEBAR_MESSAGES: MessagesIndexSnapshot["messagesById"] = {};

function createSidebarProjectionSubscription(runtime: WorkspaceRuntimeContext | null) {
  const expectedOwner = runtime == null ? null : workspaceRuntimeOwnerKey(runtime);
  const catalogSource = createChatsCatalogSource(runtime);
  const messageSource = createMessagesIndexSource(runtime);
  const emptyMessenger = {
    ...EMPTY_CHATS_CATALOG,
    ownerKey: expectedOwner,
    isLoading: runtime != null,
  };
  const emptyUsers = useUsersStore.getInitialState().usersById;
  let cached: SidebarProjectionSnapshot | undefined;
  const isRuntimeCurrent = () =>
    runtime == null
      ? useWorkspaceAuthStore.getState().getCurrentRuntimeContext() == null
      : isWorkspaceRuntimeRequestContextCurrent(runtime, () =>
          useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
        );

  const readSnapshot = (): SidebarProjectionSnapshot => {
    const current = catalogSource.getSnapshot();
    const valid = isRuntimeCurrent() && current.ownerKey === expectedOwner;
    const messenger = valid ? current : emptyMessenger;
    const messages = messageSource.getSnapshot();
    const users = useUsersStore.getState();
    const messagesById =
      valid && messages.ownerKey === messenger.ownerKey
        ? messages.messagesById
        : EMPTY_SIDEBAR_MESSAGES;
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
    const current = catalogSource.getSnapshot();
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
      if (!isTabVisible() || timer != null) return;
      timer = setTimeout(() => {
        timer = null;
        if (isTabVisible()) flush();
      }, PROJECTION_INTERVAL_MS);
    };
    let messageOwner = messageSource.getSnapshot().ownerKey;
    const unsubscribers = [
      catalogSource.subscribe(() => {
        const catalog = catalogSource.getSnapshot();
        changed(
          catalog.ownerKey !== published.messenger.ownerKey ||
            catalog.bootstrapRequestVersion !== published.messenger.bootstrapRequestVersion ||
            catalog.isLoading !== published.messenger.isLoading ||
            catalog.error !== published.messenger.error,
        );
      }),
      messageSource.subscribe((state) => {
        const ownerChanged = state.ownerKey !== messageOwner;
        messageOwner = state.ownerKey;
        changed(ownerChanged);
      }),
      useUsersStore.subscribe((state, previous) => changed(state.ownerKey !== previous.ownerKey)),
      onVisibilityChange((visible) => {
        if (visible) flush();
        else cancel();
      }),
    ];
    const onInteraction = () => {
      if (interactionPending) return;
      interactionPending = true;
      // React and native event handlers must finish their synchronous store writes first.
      queueMicrotask(() => {
        interactionPending = false;
        if (!closed && isTabVisible()) flush();
      });
    };
    const interactions = ["click", "keydown", "input"] as const;
    if (typeof document !== "undefined") {
      for (const event of interactions) document.addEventListener(event, onInteraction);
    }
    if (readSnapshot() !== published) flush();
    return () => {
      closed = true;
      cancel();
      for (const unsubscribe of unsubscribers) unsubscribe();
      if (typeof document !== "undefined") {
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
