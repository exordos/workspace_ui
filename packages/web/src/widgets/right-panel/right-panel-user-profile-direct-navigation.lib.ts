/**
 * Navigation target for "Message" / "Call" on another user's profile.
 *
 * Rule:
 * - already on this DM stream (stream view OR any topic) → stay
 * - otherwise → open the stream's default topic
 */
import type { MessengerStream, MessengerTopic } from "~/entities/messenger/messenger.types";
import type { WorkspaceMessengerRouteMatch } from "~/shared/lib/workspace-messenger-route.lib";

export type DirectProfileChatNavigationResult =
  | { status: "already-open"; streamUuid: string }
  | { status: "open-default-topic"; streamUuid: string; topicUuid: string }
  | { status: "missing-default-topic"; streamUuid: string }
  | { status: "stream-missing" };

export interface ResolveDirectProfileChatNavigationInput {
  directUserUuid: string;
  streamsById: Readonly<Record<string, MessengerStream | undefined>>;
  topicsById: Readonly<Record<string, MessengerTopic | undefined>>;
  currentRoute: WorkspaceMessengerRouteMatch | null;
}

function findDirectStream(
  streamsById: ResolveDirectProfileChatNavigationInput["streamsById"],
  directUserUuid: string,
): MessengerStream | null {
  for (const stream of Object.values(streamsById)) {
    if (stream?.directUserUuid === directUserUuid) return stream;
  }
  return null;
}

function findDefaultTopic(
  topicsById: ResolveDirectProfileChatNavigationInput["topicsById"],
  streamUuid: string,
): MessengerTopic | null {
  for (const topic of Object.values(topicsById)) {
    if (topic?.streamUuid === streamUuid && topic.isDefault) return topic;
  }
  return null;
}

function isRouteOnStream(route: WorkspaceMessengerRouteMatch | null, streamUuid: string): boolean {
  return (route?.kind === "stream" || route?.kind === "topic") && route.streamUuid === streamUuid;
}

/** Where "Message"/"Call" should land for a direct-private profile partner. */
export function resolveDirectProfileChatNavigation(
  input: ResolveDirectProfileChatNavigationInput,
): DirectProfileChatNavigationResult {
  const stream = findDirectStream(input.streamsById, input.directUserUuid);
  if (stream == null) return { status: "stream-missing" };

  // Уже в этом ЛС (stream или любой топик, в т.ч. не default) — никуда не ведём.
  if (isRouteOnStream(input.currentRoute, stream.uuid)) {
    return { status: "already-open", streamUuid: stream.uuid };
  }

  const defaultTopic = findDefaultTopic(input.topicsById, stream.uuid);
  if (defaultTopic == null) {
    return { status: "missing-default-topic", streamUuid: stream.uuid };
  }

  return {
    status: "open-default-topic",
    streamUuid: stream.uuid,
    topicUuid: defaultTopic.uuid,
  };
}
