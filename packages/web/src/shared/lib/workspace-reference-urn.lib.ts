const WORKSPACE_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WORKSPACE_UUID_PATTERN_SOURCE =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const WORKSPACE_REFERENCE_URN_PATTERN = new RegExp(
  `^urn:(user|message|stream):(${WORKSPACE_UUID_PATTERN_SOURCE})$`,
  "i",
);
const WORKSPACE_TOPIC_URN_PATTERN = new RegExp(
  `^urn:topic:(${WORKSPACE_UUID_PATTERN_SOURCE})(?::(${WORKSPACE_UUID_PATTERN_SOURCE}))?$`,
  "i",
);

export type WorkspaceTopicUrnReference =
  | { kind: "topic"; streamUuid: string; topicUuid: string }
  | { kind: "topic"; topicUuid: string; streamUuid?: never };

export type WorkspaceUrnReference =
  | { kind: "user"; userUuid: string }
  | { kind: "message"; messageUuid: string }
  | { kind: "stream"; streamUuid: string }
  | WorkspaceTopicUrnReference;

export function isWorkspaceUuid(value: unknown): value is string {
  return typeof value === "string" && WORKSPACE_UUID_PATTERN.test(value);
}

function normalizeWorkspaceUuid(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalizedValue = value.trim();
  return isWorkspaceUuid(normalizedValue) ? normalizedValue : null;
}

function buildUuidUrn(kind: "user" | "message" | "stream", uuid: unknown): string | null {
  const normalizedUuid = normalizeWorkspaceUuid(uuid);
  return normalizedUuid == null ? null : `urn:${kind}:${normalizedUuid}`;
}

export function buildWorkspaceUserUrn(userUuid: unknown): string | null {
  return buildUuidUrn("user", userUuid);
}

export function buildWorkspaceMessageUrn(messageUuid: unknown): string | null {
  return buildUuidUrn("message", messageUuid);
}

export function buildWorkspaceStreamUrn(streamUuid: unknown): string | null {
  return buildUuidUrn("stream", streamUuid);
}

export function buildWorkspaceTopicUrn(topicUuid: unknown): string | null {
  const normalizedTopicUuid = normalizeWorkspaceUuid(topicUuid);
  return normalizedTopicUuid == null ? null : `urn:topic:${normalizedTopicUuid}`;
}

export function buildWorkspaceReferenceUrn(
  reference: WorkspaceUrnReference | null | undefined,
): string | null {
  if (reference == null) {
    return null;
  }

  switch (reference.kind) {
    case "user":
      return buildWorkspaceUserUrn(reference.userUuid);
    case "message":
      return buildWorkspaceMessageUrn(reference.messageUuid);
    case "stream":
      return buildWorkspaceStreamUrn(reference.streamUuid);
    case "topic":
      return buildWorkspaceTopicUrn(reference.topicUuid);
    default:
      return null;
  }
}

export function parseWorkspaceReferenceUrn(value: unknown): WorkspaceUrnReference | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  const topicMatch = WORKSPACE_TOPIC_URN_PATTERN.exec(normalizedValue);
  if (topicMatch != null) {
    const firstUuid = topicMatch[1];
    const secondUuid = topicMatch[2];
    if (firstUuid == null) {
      return null;
    }
    return secondUuid == null
      ? { kind: "topic", topicUuid: firstUuid }
      : { kind: "topic", streamUuid: firstUuid, topicUuid: secondUuid };
  }

  const referenceMatch = WORKSPACE_REFERENCE_URN_PATTERN.exec(normalizedValue);
  if (referenceMatch == null) {
    return null;
  }

  const kind = referenceMatch[1];
  const uuid = referenceMatch[2];
  if (kind == null || uuid == null || !isWorkspaceUuid(uuid)) {
    return null;
  }

  switch (kind.toLowerCase()) {
    case "user":
      return { kind: "user", userUuid: uuid };
    case "message":
      return { kind: "message", messageUuid: uuid };
    case "stream":
      return { kind: "stream", streamUuid: uuid };
    default:
      return null;
  }
}
