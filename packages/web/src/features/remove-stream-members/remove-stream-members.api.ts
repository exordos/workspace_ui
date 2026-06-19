// remove-stream-members API adapter — delegates to shared/api transport.
import {
  removeMembersFromStream,
  type RemoveStreamMembersParams,
  type RemoveStreamMembersResult,
} from "~/shared/api/messenger-streams";

export async function removeStreamMembers(
  params: RemoveStreamMembersParams,
): Promise<RemoveStreamMembersResult> {
  return removeMembersFromStream(params);
}
