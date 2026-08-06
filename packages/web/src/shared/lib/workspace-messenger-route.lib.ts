import { extractOrgRouteFromPathname, withOrgRoutePrefix } from "./org-route";

// Новый Workspace-мессенджер живёт на project-маршрутах.
// По этим маршрутам layout понимает, что надо включить новый сайдбар и не запускать старый Zulip-flow.
export type WorkspaceMessengerRouteMatch =
  | {
      kind: "root";
      orgId: string;
      projectId: string;
    }
  | {
      kind: "inbox";
      orgId: string;
      projectId: string;
    }
  | {
      kind: "activity";
      orgId: string;
      projectId: string;
      filter: string;
    }
  | {
      kind: "feed";
      orgId: string;
      projectId: string;
    }
  | {
      kind: "stream";
      orgId: string;
      projectId: string;
      streamUuid: string;
    }
  | {
      kind: "topic";
      orgId: string;
      projectId: string;
      streamUuid: string;
      topicUuid: string;
    }
  | {
      kind: "message";
      orgId: string;
      projectId: string;
      messageUuid: string;
    };

function encodeRouteSegment(value: string): string {
  return encodeURIComponent(value);
}

function safeDecodeRouteSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

const WORKSPACE_MESSAGE_ANCHOR_PREFIX = "message-";

export function workspaceMessengerMessageAnchor(messageUuid: string): string {
  return `#${WORKSPACE_MESSAGE_ANCHOR_PREFIX}${encodeRouteSegment(messageUuid)}`;
}

export function parseWorkspaceMessengerMessageAnchor(hash: string): string | null {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!normalizedHash.startsWith(WORKSPACE_MESSAGE_ANCHOR_PREFIX)) return null;

  const encodedMessageUuid = normalizedHash.slice(WORKSPACE_MESSAGE_ANCHOR_PREFIX.length);
  if (encodedMessageUuid.length === 0) return null;

  const messageUuid = safeDecodeRouteSegment(encodedMessageUuid).trim();
  return messageUuid.length > 0 ? messageUuid : null;
}

export function workspaceMessengerRootRoute(orgId: string, projectId: string): string {
  return withOrgRoutePrefix(`/project/${encodeRouteSegment(projectId)}/messenger`, orgId);
}

export function workspaceInboxRoute(orgId: string, projectId: string): string {
  return withOrgRoutePrefix(`/project/${encodeRouteSegment(projectId)}/inbox`, orgId);
}

export function workspaceActivityRoute(input: {
  orgId: string;
  projectId: string;
  filter: string;
}): string {
  return withOrgRoutePrefix(
    `/project/${encodeRouteSegment(input.projectId)}/activity/${encodeRouteSegment(input.filter)}`,
    input.orgId,
  );
}

export function workspaceFeedRoute(orgId: string, projectId: string): string {
  return withOrgRoutePrefix(`/project/${encodeRouteSegment(projectId)}/feed`, orgId);
}

export function workspaceMessengerStreamRoute(input: {
  orgId: string;
  projectId: string;
  streamUuid: string;
}): string {
  return withOrgRoutePrefix(
    `/project/${encodeRouteSegment(input.projectId)}/stream/${encodeRouteSegment(
      input.streamUuid,
    )}`,
    input.orgId,
  );
}

export function workspaceMessengerTopicRoute(input: {
  orgId: string;
  projectId: string;
  streamUuid: string;
  topicUuid: string;
}): string {
  return withOrgRoutePrefix(
    `/project/${encodeRouteSegment(input.projectId)}/stream/${encodeRouteSegment(
      input.streamUuid,
    )}/topic/${encodeRouteSegment(input.topicUuid)}`,
    input.orgId,
  );
}

export function workspaceMessengerMessageRoute(input: {
  orgId: string;
  projectId: string;
  messageUuid: string;
}): string {
  return withOrgRoutePrefix(
    `/project/${encodeRouteSegment(input.projectId)}/message/${encodeRouteSegment(
      input.messageUuid,
    )}`,
    input.orgId,
  );
}

export function parseWorkspaceMessengerRoute(
  pathname: string,
): WorkspaceMessengerRouteMatch | null {
  // orgId остаётся частью общего shell-роутинга, а projectId нужен именно Workspace API.
  const { orgId, scopedPathname } = extractOrgRouteFromPathname(pathname);
  if (orgId == null) return null;

  const rootMatch = /^\/project\/([^/]+)\/messenger\/?$/.exec(scopedPathname);
  if (rootMatch?.[1]) {
    return {
      kind: "root",
      orgId,
      projectId: safeDecodeRouteSegment(rootMatch[1]),
    };
  }

  const inboxMatch = /^\/project\/([^/]+)\/inbox\/?$/.exec(scopedPathname);
  if (inboxMatch?.[1]) {
    return {
      kind: "inbox",
      orgId,
      projectId: safeDecodeRouteSegment(inboxMatch[1]),
    };
  }

  const activityMatch = /^\/project\/([^/]+)\/activity\/([^/]+)\/?$/.exec(scopedPathname);
  if (activityMatch?.[1] && activityMatch[2]) {
    return {
      kind: "activity",
      orgId,
      projectId: safeDecodeRouteSegment(activityMatch[1]),
      filter: safeDecodeRouteSegment(activityMatch[2]),
    };
  }

  const feedMatch = /^\/project\/([^/]+)\/feed\/?$/.exec(scopedPathname);
  if (feedMatch?.[1]) {
    return {
      kind: "feed",
      orgId,
      projectId: safeDecodeRouteSegment(feedMatch[1]),
    };
  }

  const topicMatch = /^\/project\/([^/]+)\/stream\/([^/]+)\/topic\/([^/]+)\/?$/.exec(
    scopedPathname,
  );
  if (topicMatch?.[1] && topicMatch[2] && topicMatch[3]) {
    return {
      kind: "topic",
      orgId,
      projectId: safeDecodeRouteSegment(topicMatch[1]),
      streamUuid: safeDecodeRouteSegment(topicMatch[2]),
      topicUuid: safeDecodeRouteSegment(topicMatch[3]),
    };
  }

  const streamMatch = /^\/project\/([^/]+)\/stream\/([^/]+)\/?$/.exec(scopedPathname);
  if (streamMatch?.[1] && streamMatch[2]) {
    return {
      kind: "stream",
      orgId,
      projectId: safeDecodeRouteSegment(streamMatch[1]),
      streamUuid: safeDecodeRouteSegment(streamMatch[2]),
    };
  }

  const messageMatch = /^\/project\/([^/]+)\/message\/([^/]+)\/?$/.exec(scopedPathname);
  if (messageMatch?.[1] && messageMatch[2]) {
    return {
      kind: "message",
      orgId,
      projectId: safeDecodeRouteSegment(messageMatch[1]),
      messageUuid: safeDecodeRouteSegment(messageMatch[2]),
    };
  }

  return null;
}

export function isWorkspaceMessengerRoute(pathname: string): boolean {
  return parseWorkspaceMessengerRoute(pathname) != null;
}

/** Returns true for pre-Workspace messenger paths that must never be navigated to. */
export function isLegacyMessengerPathname(pathname: string): boolean {
  const { scopedPathname } = extractOrgRouteFromPathname(pathname);
  return /^(?:\/stream|\/dm|\/message|\/inbox|\/feed|\/activity)(?:[/?#]|$)/.test(scopedPathname);
}
