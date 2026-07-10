import type { MessengerUuid } from "~/entities/messenger/messenger.types";
import {
  buildWorkspaceQuoteBlock,
  buildWorkspaceQuoteHeader,
} from "~/shared/lib/workspace-message-quote.lib";
import type {
  CreateWorkspaceDirectForwardStream,
  WorkspaceForwardDirectStreamAppliedResult,
  WorkspaceForwardSourceMessage,
  WorkspaceForwardStreamCandidate,
  WorkspaceForwardStreamOption,
  WorkspaceForwardTarget,
  WorkspaceForwardTopicCandidate,
  WorkspaceForwardTopicOption,
  WorkspaceResolvedForwardTarget,
} from "./workspace-forward-message.types";

export function normalizeSelectedForwardText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized != null && normalized.length > 0 ? normalized : undefined;
}

export function uniqueForwardMessageUuids(messageUuids: readonly MessengerUuid[]): MessengerUuid[] {
  const seen = new Set<MessengerUuid>();
  const result: MessengerUuid[] = [];
  for (const messageUuid of messageUuids) {
    const normalized = messageUuid.trim();
    if (normalized.length === 0 || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function messageFromLookup(
  messages:
    | readonly WorkspaceForwardSourceMessage[]
    | ReadonlyMap<MessengerUuid, WorkspaceForwardSourceMessage>
    | Readonly<Record<MessengerUuid, WorkspaceForwardSourceMessage | undefined>>,
  messageUuid: MessengerUuid,
): WorkspaceForwardSourceMessage | undefined {
  if (Array.isArray(messages)) {
    return messages.find((message) => message.uuid === messageUuid);
  }
  if (messages instanceof Map) {
    return messages.get(messageUuid);
  }
  const messagesById = messages as Readonly<
    Record<MessengerUuid, WorkspaceForwardSourceMessage | undefined>
  >;
  return messagesById[messageUuid];
}

export function resolveWorkspaceForwardMessages(options: {
  messageUuids: readonly MessengerUuid[];
  messages:
    | readonly WorkspaceForwardSourceMessage[]
    | ReadonlyMap<MessengerUuid, WorkspaceForwardSourceMessage>
    | Readonly<Record<MessengerUuid, WorkspaceForwardSourceMessage | undefined>>;
}): WorkspaceForwardSourceMessage[] {
  return uniqueForwardMessageUuids(options.messageUuids).flatMap((messageUuid) => {
    const message = messageFromLookup(options.messages, messageUuid);
    return message == null ? [] : [message];
  });
}

export function buildWorkspaceForwardMarkdown(options: {
  messages: readonly WorkspaceForwardSourceMessage[];
  selectedText?: string;
  resolveAuthorLabel?: (
    authorUuid: MessengerUuid,
    message: WorkspaceForwardSourceMessage,
  ) => string;
  wroteLabel?: string;
}): string {
  const selectedText = normalizeSelectedForwardText(options.selectedText);
  const shouldUseSelectedText = options.messages.length === 1 && selectedText != null;
  const wroteLabel = options.wroteLabel ?? "wrote";

  return options.messages
    .map((message) => {
      const senderName =
        options.resolveAuthorLabel?.(message.authorUuid, message) ?? message.authorUuid;
      const header = buildWorkspaceQuoteHeader({
        senderName,
        senderUuid: message.authorUuid,
        wroteLabel,
        messageUuid: message.uuid,
      });
      const content = shouldUseSelectedText ? selectedText : message.payload.content;
      return buildWorkspaceQuoteBlock(header, content);
    })
    .join("")
    .trimEnd();
}

export function buildWorkspaceForwardStreamOptions(
  streams: readonly WorkspaceForwardStreamCandidate[],
): WorkspaceForwardStreamOption[] {
  return streams
    .filter((stream) => stream.isArchived !== true)
    .filter((stream) => {
      // Direct в Workspace хранится как private stream, но в выборе цели это отдельный user target.
      return !(stream.isPrivate && stream.directUserUuid != null);
    })
    .map((stream) => ({
      streamUuid: stream.uuid,
      label: stream.name,
      audience: stream.audience,
      isPrivate: stream.isPrivate,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function buildWorkspaceForwardTopicOptions(options: {
  streamUuid: MessengerUuid;
  topics: readonly WorkspaceForwardTopicCandidate[];
}): WorkspaceForwardTopicOption[] {
  return options.topics
    .filter((topic) => topic.streamUuid === options.streamUuid)
    .map((topic) => ({
      topicUuid: topic.uuid,
      streamUuid: topic.streamUuid,
      label: topic.name,
      isDefault: topic.isDefault,
      isDone: topic.isDone === true,
    }))
    .sort((left, right) => {
      if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
      return left.label.localeCompare(right.label);
    });
}

export function findWorkspaceDirectForwardTarget(options: {
  userUuid: MessengerUuid;
  streams: readonly WorkspaceForwardStreamCandidate[];
  topics: readonly WorkspaceForwardTopicCandidate[];
}): WorkspaceResolvedForwardTarget | null {
  const stream = options.streams.find(
    (candidate) =>
      candidate.isPrivate &&
      candidate.directUserUuid === options.userUuid &&
      candidate.isArchived !== true,
  );
  if (stream == null) return null;

  const topic = options.topics.find(
    (candidate) => candidate.streamUuid === stream.uuid && candidate.isDefault,
  );
  if (topic == null) return null;

  return { kind: "topic", streamUuid: stream.uuid, topicUuid: topic.uuid };
}

function isAppliedDirectStreamResult(
  result: Awaited<ReturnType<CreateWorkspaceDirectForwardStream>>,
): result is WorkspaceForwardDirectStreamAppliedResult {
  return "stream" in result && "defaultTopic" in result;
}

export async function resolveWorkspaceForwardTarget(options: {
  target: WorkspaceForwardTarget;
  runtimeContext: Parameters<CreateWorkspaceDirectForwardStream>[0]["runtimeContext"];
  streams: readonly WorkspaceForwardStreamCandidate[];
  topics: readonly WorkspaceForwardTopicCandidate[];
  createWorkspaceDirectStream: CreateWorkspaceDirectForwardStream;
}): Promise<WorkspaceResolvedForwardTarget> {
  if (options.target.kind === "topic") return options.target;

  const existingTarget = findWorkspaceDirectForwardTarget({
    userUuid: options.target.userUuid,
    streams: options.streams,
    topics: options.topics,
  });
  if (existingTarget != null) return existingTarget;

  // Direct отправка создается как private stream с default topic: отдельного numeric-DM пути здесь нет.
  const created = await options.createWorkspaceDirectStream({
    runtimeContext: options.runtimeContext,
    directUserUuid: options.target.userUuid,
  });
  if (!isAppliedDirectStreamResult(created)) {
    throw new Error(`Cannot resolve direct forward target: ${created.reason}`);
  }

  return {
    kind: "topic",
    streamUuid: created.stream.uuid,
    topicUuid: created.defaultTopic.uuid,
  };
}
