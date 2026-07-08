import { buildJitsiMeetingUrl } from "~/shared/lib/jitsi";

interface BuildWorkspaceJitsiRoomNameInput {
  organizationId: string;
  projectId: string;
  streamUuid: string;
  topicUuid: string;
  nowMs?: number;
}

interface BuildWorkspaceJitsiMeetingUrlInput extends BuildWorkspaceJitsiRoomNameInput {
  meetUrl: string;
}

const NON_ROOM_SEGMENT_SYMBOLS = /[^a-zA-Z0-9-]+/g;

function normalizeRoomSegment(value: string): string {
  const normalized = value
    .trim()
    .replace(NON_ROOM_SEGMENT_SYMBOLS, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return normalized.length > 0 ? normalized : "room";
}

export function buildWorkspaceJitsiRoomName(input: BuildWorkspaceJitsiRoomNameInput): string {
  const nowMs = input.nowMs ?? Date.now();
  return [
    "workspace",
    input.organizationId,
    input.projectId,
    input.streamUuid,
    input.topicUuid,
    String(nowMs),
  ]
    .map(normalizeRoomSegment)
    .join("-");
}

export function buildWorkspaceJitsiMeetingUrl(input: BuildWorkspaceJitsiMeetingUrlInput): string {
  return buildJitsiMeetingUrl(buildWorkspaceJitsiRoomName(input), {
    serverBaseUrl: input.meetUrl,
  });
}
