import { createLogger } from "~/shared/lib/logger";
import {
  workspaceMessengerStreamRoute,
  workspaceMessengerTopicRoute,
} from "~/shared/lib/workspace-messenger-route.lib";
import type { MessengerStoreState } from "./messenger.model";
import type {
  MessengerFolder,
  MessengerSidebarFolderView,
  MessengerSidebarStreamItem,
  MessengerSidebarTopicItem,
  MessengerStream,
  MessengerTopic,
  MessengerUuid,
} from "./messenger.types";

const EMPTY_SIDEBAR_STREAMS: MessengerSidebarStreamItem[] = [];
const EMPTY_SIDEBAR_FOLDERS: MessengerSidebarFolderView[] = [];
const EMPTY_SIDEBAR_TOPICS: MessengerSidebarTopicItem[] = [];
const log = createLogger("store:messenger-sidebar");

// Этот файл ничего не загружает из API.
// Он берёт уже сохранённые Workspace-данные из messenger store и собирает из них вид для сайдбара.
export interface MessengerSidebarSelectorOptions {
  organizationId: string;
  projectId: string;
  selectedFolderUuid?: string | null;
}

interface SidebarStreamsCacheEntry {
  streamIds: MessengerUuid[];
  streamsById: MessengerStoreState["streamsById"];
  topicIds: MessengerUuid[];
  topicsById: MessengerStoreState["topicsById"];
  foldersById: MessengerStoreState["foldersById"];
  organizationId: string;
  projectId: string;
  selectedFolderUuid: string | null;
  result: MessengerSidebarStreamItem[];
}

interface SidebarFoldersCacheEntry {
  folderIds: MessengerUuid[];
  foldersById: MessengerStoreState["foldersById"];
  result: MessengerSidebarFolderView[];
}

let sidebarStreamsCache: SidebarStreamsCacheEntry | null = null;
let sidebarFoldersCache: SidebarFoldersCacheEntry | null = null;

// Сайдбар пересчитывается часто, поэтому держим простой кэш по ссылкам из store.
// Если streams/topics/folders не менялись, React получает тот же массив и не перерисовывает список зря.
function compareNullableStrings(a: string | null, b: string | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a.localeCompare(b);
}

function compareSidebarStreams(
  a: MessengerSidebarStreamItem,
  b: MessengerSidebarStreamItem,
): number {
  if (a.pinnedAt != null && b.pinnedAt == null) return -1;
  if (a.pinnedAt == null && b.pinnedAt != null) return 1;

  const orderIndexCompare = (a.orderIndex ?? Number.MAX_SAFE_INTEGER) -
    (b.orderIndex ?? Number.MAX_SAFE_INTEGER);
  if (orderIndexCompare !== 0) return orderIndexCompare;

  return compareNullableStrings(b.updatedAt, a.updatedAt) || a.title.localeCompare(b.title);
}

function topicItemFromTopic(input: {
  organizationId: string;
  projectId: string;
  topic: MessengerTopic;
}): MessengerSidebarTopicItem {
  // topic:<streamUuid>:<topicUuid> - временный ключ фронтенда для выбора строки.
  // В API нет отдельной сущности "conversation"; настоящие id остаются streamUuid и topicUuid.
  return {
    id: `topic:${input.topic.streamUuid}:${input.topic.uuid}`,
    streamUuid: input.topic.streamUuid,
    topicUuid: input.topic.uuid,
    title: input.topic.name,
    unreadCount: input.topic.unreadCount,
    isDone: input.topic.isDone,
    route: workspaceMessengerTopicRoute({
      orgId: input.organizationId,
      projectId: input.projectId,
      streamUuid: input.topic.streamUuid,
      topicUuid: input.topic.uuid,
    }),
    preview: null,
    updatedAt: input.topic.updatedAt,
  };
}

function streamItemFromStream(input: {
  organizationId: string;
  projectId: string;
  stream: MessengerStream;
  topics: MessengerSidebarTopicItem[];
  unreadCount?: number;
  pinnedAt?: string | null;
  orderIndex?: number | null;
}): MessengerSidebarStreamItem {
  // stream:<uuid> - такой же ключ только для строки потока в сайдбаре.
  // В route и в будущие запросы всё равно передаём настоящий backend uuid потока.
  return {
    id: `stream:${input.stream.uuid}`,
    streamUuid: input.stream.uuid,
    title: input.stream.name,
    audience: input.stream.audience,
    isPrivate: input.stream.isPrivate,
    unreadCount: input.unreadCount ?? input.stream.unreadCount,
    pinnedAt: input.pinnedAt ?? null,
    orderIndex: input.orderIndex ?? null,
    route: workspaceMessengerStreamRoute({
      orgId: input.organizationId,
      projectId: input.projectId,
      streamUuid: input.stream.uuid,
    }),
    topics: input.topics,
    preview: null,
    updatedAt: input.stream.updatedAt,
  };
}

function topicsForStream(input: {
  organizationId: string;
  projectId: string;
  state: MessengerStoreState;
  streamUuid: MessengerUuid;
}): MessengerSidebarTopicItem[] {
  // Темы пока живут плоским списком в store, поэтому здесь привязываем их к нужному потоку.
  const topics = input.state.topicIds
    .map((topicId) => input.state.topicsById[topicId])
    .filter(
      (topic): topic is MessengerTopic =>
        topic?.streamUuid === input.streamUuid,
    )
    .map((topic) =>
      topicItemFromTopic({
        organizationId: input.organizationId,
        projectId: input.projectId,
        topic,
      }),
    );

  if (topics.length === 0) return EMPTY_SIDEBAR_TOPICS;
  return topics;
}

function streamsForSelectedFolder(input: {
  organizationId: string;
  projectId: string;
  state: MessengerStoreState;
  folder: MessengerFolder;
}): MessengerSidebarStreamItem[] {
  const streams: MessengerSidebarStreamItem[] = [];
  const missingStreamUuids: MessengerUuid[] = [];

  for (const item of input.folder.items) {
    const stream = input.state.streamsById[item.streamUuid];
    if (stream == null) {
      missingStreamUuids.push(item.streamUuid);
      continue;
    }

    streams.push(
      streamItemFromStream({
        organizationId: input.organizationId,
        projectId: input.projectId,
        stream,
        unreadCount: item.unreadCount,
        pinnedAt: item.pinnedAt,
        orderIndex: item.orderIndex,
        topics: topicsForStream({
          organizationId: input.organizationId,
          projectId: input.projectId,
          state: input.state,
          streamUuid: stream.uuid,
        }),
      }),
    );
  }

  if (missingStreamUuids.length > 0) {
    log.warn("Folder items reference streams missing from messenger store", {
      folderUuid: input.folder.uuid,
      folderItems: input.folder.items.length,
      storeStreams: input.state.streamIds.length,
      matchedStreams: streams.length,
      missingStreams: missingStreamUuids.length,
      sampleMissingStreamUuids: missingStreamUuids.slice(0, 10),
    });
  }

  return streams.sort(compareSidebarStreams);
}

export function selectMessengerSidebarStreams(
  state: MessengerStoreState,
  options: MessengerSidebarSelectorOptions,
): MessengerSidebarStreamItem[] {
  const selectedFolderUuid = options.selectedFolderUuid ?? null;
  if (
    sidebarStreamsCache?.streamIds === state.streamIds &&
    sidebarStreamsCache.streamsById === state.streamsById &&
    sidebarStreamsCache.topicIds === state.topicIds &&
    sidebarStreamsCache.topicsById === state.topicsById &&
    sidebarStreamsCache.foldersById === state.foldersById &&
    sidebarStreamsCache.organizationId === options.organizationId &&
    sidebarStreamsCache.projectId === options.projectId &&
    sidebarStreamsCache.selectedFolderUuid === selectedFolderUuid
  ) {
    return sidebarStreamsCache.result;
  }

  const selectedFolder = selectedFolderUuid != null ? state.foldersById[selectedFolderUuid] : null;
  // Если выбрана папка, порядок и счётчики берём из folder.items.
  // Если папки нет, показываем все потоки как общий список.
  const streams = selectedFolder
    ? streamsForSelectedFolder({
        organizationId: options.organizationId,
        projectId: options.projectId,
        state,
        folder: selectedFolder,
      })
    : state.streamIds
        .map((streamId) => state.streamsById[streamId])
        .filter((stream): stream is MessengerStream => stream != null)
        .map((stream) =>
          streamItemFromStream({
            organizationId: options.organizationId,
            projectId: options.projectId,
            stream,
            topics: topicsForStream({
              organizationId: options.organizationId,
              projectId: options.projectId,
              state,
              streamUuid: stream.uuid,
            }),
          }),
        );

  const result = streams.length > 0 ? streams : EMPTY_SIDEBAR_STREAMS;
  sidebarStreamsCache = {
    streamIds: state.streamIds,
    streamsById: state.streamsById,
    topicIds: state.topicIds,
    topicsById: state.topicsById,
    foldersById: state.foldersById,
    organizationId: options.organizationId,
    projectId: options.projectId,
    selectedFolderUuid,
    result,
  };
  return result;
}

export function selectMessengerSidebarFolders(
  state: MessengerStoreState,
): MessengerSidebarFolderView[] {
  if (
    sidebarFoldersCache?.folderIds === state.folderIds &&
    sidebarFoldersCache.foldersById === state.foldersById
  ) {
    return sidebarFoldersCache.result;
  }

  const folders = state.folderIds
    .map((folderId) => state.foldersById[folderId])
    .filter((folder): folder is MessengerFolder => folder != null)
    .map((folder) => ({
      folderUuid: folder.uuid,
      title: folder.title,
      backgroundColorValue: folder.backgroundColorValue,
      unreadCount: folder.unreadCount,
      systemType: folder.systemType,
      items: folder.items,
    }));

  const result = folders.length > 0 ? folders : EMPTY_SIDEBAR_FOLDERS;
  sidebarFoldersCache = {
    folderIds: state.folderIds,
    foldersById: state.foldersById,
    result,
  };
  return result;
}
