import type {
  MessengerFolder,
  MessengerSidebarStreamItem,
} from "~/entities/messenger/messenger.types";

export interface WorkspaceSidebarSearchProjection {
  localStreams: MessengerSidebarStreamItem[];
  globalStreams: MessengerSidebarStreamItem[];
}

function projectMatchingStream(
  stream: MessengerSidebarStreamItem,
  normalizedQuery: string,
): MessengerSidebarStreamItem | null {
  const streamMatches = stream.title.toLowerCase().includes(normalizedQuery);
  const matchingTopics = stream.topics.filter((topic) =>
    topic.title.toLowerCase().includes(normalizedQuery),
  );

  if (!streamMatches && matchingTopics.length === 0) return null;
  if (matchingTopics.length === stream.topics.length) return stream;
  return { ...stream, topics: matchingTopics };
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
