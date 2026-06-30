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

export function workspaceMessengerRootRoute(orgId: string, projectId: string): string {
  return withOrgRoutePrefix(`/project/${encodeRouteSegment(projectId)}/messenger`, orgId);
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
