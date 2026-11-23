import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import {
  isWorkspaceRuntimeRequestContextCurrent,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import { resolveMessengerTopic } from "./messenger-conversation-metadata.lib";
import {
  createWorkspaceDirectStream,
  runWorkspaceChannelCreate,
  runWorkspaceDirectStreamCreate,
} from "./messenger-create-chat-actions.lib";
import {
  runWorkspaceStreamRead,
  runWorkspaceTopicRead,
  type RunWorkspaceStreamReadOptions,
  type RunWorkspaceTopicReadOptions,
} from "./messenger-read-actions.lib";
import {
  runWorkspaceCreateTopicRequest,
  runWorkspaceFolderAssignmentToggle,
  runWorkspaceFolderItemPinToggle,
  runWorkspaceStreamArchive,
  runWorkspaceStreamNotificationUpdate,
  runWorkspaceStreamRenameRequest,
  runWorkspaceStreamUnarchive,
  runWorkspaceTopicDoneToggle,
  runWorkspaceTopicNotificationUpdate,
  runWorkspaceTopicRenameRequest,
  updateMessengerStreamKeySharing,
} from "./messenger-sidebar-actions.lib";
import { useMessengerStreamBindingsForRoute } from "./messenger-stream-bindings-loader.lib";
import {
  addWorkspaceStreamMembers,
  removeWorkspaceStreamMember,
} from "./messenger-stream-member-actions.lib";
import { updateMessengerTopicSummaryConfiguration } from "./messenger-topic-summary-actions.lib";
import { useMessengerStore } from "./messenger.model";

const getRuntime = () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext();

// Делегирует намерения существующим операциям владельца каталога.
export const chatCommands = {
  createChannel: (...args: Parameters<typeof runWorkspaceChannelCreate>) =>
    runWorkspaceChannelCreate(...args),
  openDirect: (...args: Parameters<typeof runWorkspaceDirectStreamCreate>) =>
    runWorkspaceDirectStreamCreate(...args),
  openDirectForRuntime: ({
    runtimeContext,
    directUserUuid,
    name,
    description,
    signal,
  }: Pick<
    Parameters<typeof createWorkspaceDirectStream>[0],
    "runtimeContext" | "directUserUuid" | "name" | "description" | "signal"
  >) =>
    createWorkspaceDirectStream({
      runtimeContext,
      directUserUuid,
      name,
      description,
      signal,
      getRuntimeContext: getRuntime,
    }),
  notifyStream: (...args: Parameters<typeof runWorkspaceStreamNotificationUpdate>) =>
    runWorkspaceStreamNotificationUpdate(...args),
  renameStream: (...args: Parameters<typeof runWorkspaceStreamRenameRequest>) =>
    runWorkspaceStreamRenameRequest(...args),
  archiveStream: (...args: Parameters<typeof runWorkspaceStreamArchive>) =>
    runWorkspaceStreamArchive(...args),
  unarchiveStream: (...args: Parameters<typeof runWorkspaceStreamUnarchive>) =>
    runWorkspaceStreamUnarchive(...args),
  updateKeySharing: ({
    runtimeContext,
    streamUuid,
    allowKeySharingByHolders,
    signal,
  }: Pick<
    Parameters<typeof updateMessengerStreamKeySharing>[0],
    "runtimeContext" | "streamUuid" | "allowKeySharingByHolders" | "signal"
  >) =>
    updateMessengerStreamKeySharing({
      runtimeContext,
      streamUuid,
      allowKeySharingByHolders,
      signal,
      getRuntimeContext: getRuntime,
    }),
  createTopic: (...args: Parameters<typeof runWorkspaceCreateTopicRequest>) =>
    runWorkspaceCreateTopicRequest(...args),
  renameTopic: (...args: Parameters<typeof runWorkspaceTopicRenameRequest>) =>
    runWorkspaceTopicRenameRequest(...args),
  toggleTopicDone: (...args: Parameters<typeof runWorkspaceTopicDoneToggle>) =>
    runWorkspaceTopicDoneToggle(...args),
  notifyTopic: (...args: Parameters<typeof runWorkspaceTopicNotificationUpdate>) =>
    runWorkspaceTopicNotificationUpdate(...args),
  updateTopicSummary: ({
    runtimeContext,
    topicUuid,
    body,
    signal,
  }: Pick<
    Parameters<typeof updateMessengerTopicSummaryConfiguration>[0],
    "runtimeContext" | "topicUuid" | "body" | "signal"
  >) =>
    updateMessengerTopicSummaryConfiguration({
      runtimeContext,
      topicUuid,
      body,
      signal,
      getRuntimeContext: getRuntime,
    }),
  assignFolder: (...args: Parameters<typeof runWorkspaceFolderAssignmentToggle>) =>
    runWorkspaceFolderAssignmentToggle(...args),
  pinFolderItem: (...args: Parameters<typeof runWorkspaceFolderItemPinToggle>) =>
    runWorkspaceFolderItemPinToggle(...args),
  readStream: (options: RunWorkspaceStreamReadOptions) => runWorkspaceStreamRead(options),
  readTopic: (options: RunWorkspaceTopicReadOptions) => runWorkspaceTopicRead(options),
  addMembers: ({
    runtimeContext,
    streamUuid,
    userUuids,
    signal,
  }: Pick<
    Parameters<typeof addWorkspaceStreamMembers>[0],
    "runtimeContext" | "streamUuid" | "userUuids" | "signal"
  >) =>
    addWorkspaceStreamMembers({
      runtimeContext,
      streamUuid,
      userUuids,
      signal,
      getRuntimeContext: getRuntime,
    }),
  removeMember: ({
    runtimeContext,
    streamUuid,
    bindingUuid,
    userUuid,
    signal,
  }: Pick<
    Parameters<typeof removeWorkspaceStreamMember>[0],
    "runtimeContext" | "streamUuid" | "bindingUuid" | "userUuid" | "signal"
  >) =>
    removeWorkspaceStreamMember({
      runtimeContext,
      streamUuid,
      bindingUuid,
      userUuid,
      signal,
      getRuntimeContext: getRuntime,
    }),
};

// Сохранение найденной темы принадлежит каталогу, решение о навигации — вызывающему.
export async function resolveChatTopic({
  runtimeContext,
  topicUuid,
  signal,
}: Pick<Parameters<typeof resolveMessengerTopic>[0], "runtimeContext" | "topicUuid" | "signal">) {
  const isCurrent = () =>
    signal?.aborted !== true && isWorkspaceRuntimeRequestContextCurrent(runtimeContext, getRuntime);
  if (!isCurrent()) return null;
  const topic = await resolveMessengerTopic({
    runtimeContext,
    topicUuid,
    signal,
    getRuntimeContext: getRuntime,
  });
  if (topic == null || !isCurrent()) return null;
  useMessengerStore.getState().upsertTopic(workspaceRuntimeOwnerKey(runtimeContext), topic);
  return isCurrent() ? topic : null;
}

// Подгружает участие для открытого маршрута тем же владельцем.
export function useChatRouteMembership(
  ...args: Parameters<typeof useMessengerStreamBindingsForRoute>
) {
  return useMessengerStreamBindingsForRoute(...args);
}
