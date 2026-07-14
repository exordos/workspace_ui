import type { MessengerStream, MessengerTopic } from "~/entities/messenger/messenger.types";
import { parseWorkspaceMessengerRoute } from "~/shared/lib/workspace-messenger-route.lib";
import {
  buildWorkspaceStreamUrn,
  buildWorkspaceTopicUrn,
} from "~/shared/lib/workspace-reference-urn.lib";

export type WorkspaceComposerReference =
  | {
      kind: "stream";
      streamUuid: string;
      streamName: string;
    }
  | {
      kind: "topic";
      topicUuid: string;
      streamUuid: string;
      streamName: string;
      topicName: string;
    };

export interface WorkspaceComposerReferenceSuggestionsInput {
  streamIds: readonly string[];
  streamsById: Readonly<Record<string, MessengerStream>>;
  topicIds: readonly string[];
  topicsById: Readonly<Record<string, MessengerTopic>>;
  query?: string;
}

export interface WorkspaceReferenceInsertion {
  value: string;
  cursorPosition: number;
}

export interface WorkspaceComposerReferenceStores {
  streamsById: Readonly<Record<string, MessengerStream>>;
  topicsById: Readonly<Record<string, MessengerTopic>>;
}

function escapeReferenceLabel(value: string): string {
  return value.replace(/[\\[\]]/g, "\\$&");
}

export function getWorkspaceComposerReferenceLabel(reference: WorkspaceComposerReference): string {
  if (reference.kind === "stream") {
    return reference.streamName;
  }
  return `#${reference.streamName} › ${reference.topicName}`;
}

export function getWorkspaceComposerReferenceSuggestions({
  streamIds,
  streamsById,
  topicIds,
  topicsById,
  query = "",
}: WorkspaceComposerReferenceSuggestionsInput): WorkspaceComposerReference[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const suggestions: WorkspaceComposerReference[] = [];
  const seenStreamUuids = new Set<string>();
  const seenTopicUuids = new Set<string>();

  for (const streamUuid of streamIds) {
    const stream = streamsById[streamUuid];
    if (stream == null) continue;
    if (normalizedQuery.length > 0 && !stream.name.toLocaleLowerCase().includes(normalizedQuery)) {
      continue;
    }
    if (seenStreamUuids.has(stream.uuid)) continue;
    seenStreamUuids.add(stream.uuid);
    suggestions.push({ kind: "stream", streamUuid: stream.uuid, streamName: stream.name });
  }

  for (const topicUuid of topicIds) {
    const topic = topicsById[topicUuid];
    if (topic == null) continue;
    const stream = streamsById[topic.streamUuid];
    if (stream == null) continue;
    const searchableText = `${stream.name} ${topic.name}`.toLocaleLowerCase();
    if (normalizedQuery.length > 0 && !searchableText.includes(normalizedQuery)) continue;
    if (seenTopicUuids.has(topic.uuid)) continue;
    seenTopicUuids.add(topic.uuid);
    suggestions.push({
      kind: "topic",
      topicUuid: topic.uuid,
      streamUuid: topic.streamUuid,
      streamName: stream.name,
      topicName: topic.name,
    });
  }

  return suggestions;
}

export function formatWorkspaceComposerReference(
  reference: WorkspaceComposerReference,
): string | null {
  if (reference.kind === "stream") {
    const urn = buildWorkspaceStreamUrn(reference.streamUuid);
    return urn == null ? null : `[${escapeReferenceLabel(reference.streamName)}](${urn})`;
  }

  const urn = buildWorkspaceTopicUrn(reference.topicUuid);
  return urn == null
    ? null
    : `[${escapeReferenceLabel(getWorkspaceComposerReferenceLabel(reference))}](${urn})`;
}

export function insertWorkspaceComposerReference(
  value: string,
  referenceStartPos: number,
  cursorPos: number,
  reference: WorkspaceComposerReference,
): WorkspaceReferenceInsertion | null {
  const formattedReference = formatWorkspaceComposerReference(reference);
  if (formattedReference == null) return null;

  const before = value.slice(0, referenceStartPos);
  const after = value.slice(cursorPos);
  const insertion = `${formattedReference} `;
  return {
    value: before + insertion + after,
    cursorPosition: before.length + insertion.length,
  };
}

const WORKSPACE_LINK_PATTERN = /(?:https?:\/\/[^\s<>()]+|ew:\/\/open\/[^\s<>()]+)/gi;

function splitTrailingPunctuation(value: string): { url: string; suffix: string } {
  const match = /[.,!?;:]+$/.exec(value);
  if (match == null) return { url: value, suffix: "" };
  return { url: value.slice(0, -match[0].length), suffix: match[0] };
}

function parseCurrentWorkspaceLink(value: string, webOrigin: string | null) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "ew:") {
      if (parsed.hostname !== "open") return null;
      return parseWorkspaceMessengerRoute(parsed.pathname);
    }
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || webOrigin == null) {
      return null;
    }
    if (parsed.origin !== webOrigin) return null;
    return parseWorkspaceMessengerRoute(parsed.pathname);
  } catch {
    return null;
  }
}

export function replaceWorkspaceComposerLinks(
  value: string,
  stores: WorkspaceComposerReferenceStores,
  webOrigin: string | null,
): string {
  return value.replace(WORKSPACE_LINK_PATTERN, (candidate) => {
    const { url, suffix } = splitTrailingPunctuation(candidate);
    const route = parseCurrentWorkspaceLink(url, webOrigin);
    if (route?.kind === "stream") {
      const stream = stores.streamsById[route.streamUuid];
      if (stream == null) return candidate;
      const formatted = formatWorkspaceComposerReference({
        kind: "stream",
        streamUuid: stream.uuid,
        streamName: stream.name,
      });
      return formatted == null ? candidate : `${formatted}${suffix}`;
    }

    if (route?.kind === "topic") {
      const topic = stores.topicsById[route.topicUuid];
      if (topic?.streamUuid !== route.streamUuid) return candidate;
      const stream = stores.streamsById[topic.streamUuid];
      if (stream == null) return candidate;
      const formatted = formatWorkspaceComposerReference({
        kind: "topic",
        topicUuid: topic.uuid,
        streamUuid: topic.streamUuid,
        streamName: stream.name,
        topicName: topic.name,
      });
      return formatted == null ? candidate : `${formatted}${suffix}`;
    }

    return candidate;
  });
}
