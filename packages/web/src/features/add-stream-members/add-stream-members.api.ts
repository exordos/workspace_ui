import { createLogger } from "~/shared/lib/logger";
import type { AddStreamMembersParams, AddStreamMembersResult } from "./add-stream-members.types";

const log = createLogger("add-stream-members");

export function addStreamMembers(params: AddStreamMembersParams): Promise<AddStreamMembersResult> {
  log.warn("Legacy stream member add is unsupported without Workspace stream UUID", {
    streamName: params.streamName,
    requestedCount: params.userIds.length,
  });
  return Promise.resolve({
    ok: false,
    addedUserIds: [],
    alreadySubscribedUserIds: [],
    unauthorizedStreams: [],
    errorCode: "unsupported",
  });
}
