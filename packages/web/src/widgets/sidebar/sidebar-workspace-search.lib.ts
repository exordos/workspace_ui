import type {
  MessengerFolder,
  MessengerSidebarStreamItem,
} from "~/entities/messenger/messenger.types";
import type { KeyboardEvent } from "react";

export function moveWorkspaceSidebarSearchFocus(event: KeyboardEvent<HTMLElement>): void {
  const { key, currentTarget } = event;
  if (key !== "ArrowDown" && key !== "ArrowUp") return;
  if (
    event.defaultPrevented ||
    event.nativeEvent.isComposing ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey
  )
    return;

  const sidebar = currentTarget.closest('[data-focus-zone="sidebar"]');
  const results = sidebar?.querySelector("[data-sidebar-search-results]");
  if (results == null) return;

  const items = Array.from(results.querySelectorAll<HTMLElement>("[data-sidebar-search-item]"));
  if (items.length === 0) return;

  const index = items.findIndex((item) => item.isSameNode(currentTarget));
  const step = key === "ArrowDown" ? 1 : -1;
  const nextItem = index === -1 && step === -1 ? items.at(-1) : items[index + step];

  event.preventDefault();
  nextItem?.focus();
}

export interface WorkspaceSidebarSearchProjection {
  localStreams: MessengerSidebarStreamItem[];
  globalStreams: MessengerSidebarStreamItem[];
}

function projectMatchingStream(
  stream: MessengerSidebarStreamItem,
  normalizedQuery: string,
): MessengerSidebarStreamItem | null {
  const streamMatches =
    stream.title.toLowerCase().includes(normalizedQuery) ||
    (stream.uiKind === "directPrivate" &&
      (stream.directUserSearchText?.toLowerCase().includes(normalizedQuery) ?? false));
  const matchingTopics = stream.topics.filter((topic) =>
    topic.title.toLowerCase().includes(normalizedQuery),
  );

  if (!streamMatches && matchingTopics.length === 0) return null;
  return stream;
}

function projectMatchingStreams(
  streams: MessengerSidebarStreamItem[],
  normalizedQuery: string,
): MessengerSidebarStreamItem[] {
  if (normalizedQuery.length === 0) return streams;

  return streams
    .map((stream) => projectMatchingStream(stream, normalizedQuery))
    .filter((stream): stream is MessengerSidebarStreamItem => stream != null);
}

export function projectWorkspaceSidebarSearch(input: {
  localStreams: MessengerSidebarStreamItem[];
  allStreams: MessengerSidebarStreamItem[];
  normalizedQuery: string;
  selectedFolderSystemType: MessengerFolder["systemType"];
}): WorkspaceSidebarSearchProjection {
  if (input.selectedFolderSystemType === "all") {
    return {
      localStreams: [],
      globalStreams: projectMatchingStreams(input.allStreams, input.normalizedQuery),
    };
  }

  const localStreams = projectMatchingStreams(input.localStreams, input.normalizedQuery);
  const localStreamUuids = new Set(localStreams.map((stream) => stream.streamUuid));
  const globalStreams = projectMatchingStreams(input.allStreams, input.normalizedQuery).filter(
    (stream) => !localStreamUuids.has(stream.streamUuid),
  );

  return { localStreams, globalStreams };
}
