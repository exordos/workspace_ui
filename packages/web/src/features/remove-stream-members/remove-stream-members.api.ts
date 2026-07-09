// remove-stream-members API adapter — legacy numeric channels are unsupported without Workspace UUIDs.
import { createLogger } from "~/shared/lib/logger";
import type {
  RemoveStreamMembersParams,
  RemoveStreamMembersResult,
} from "./remove-stream-members.types";

const log = createLogger("remove-stream-members");

export function removeStreamMembers(
  params: RemoveStreamMembersParams,
): Promise<RemoveStreamMembersResult> {
  log.warn("Legacy stream member removal is unsupported without Workspace stream UUID", {
    streamName: params.streamName,
    requestedCount: params.userIds.length,
  });
  return Promise.resolve({
    ok: false,
    removedUserIds: [],
    alreadyUnsubscribedUserIds: [],
    unauthorizedStreams: [],
    errorCode: "unsupported",
  });
}
