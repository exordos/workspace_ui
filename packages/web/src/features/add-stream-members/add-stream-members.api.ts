import {
  addMembersToStream,
  type AddStreamMembersParams,
  type AddStreamMembersResult,
} from "~/shared/api/zulip-streams";

export async function addStreamMembers(
  params: AddStreamMembersParams,
): Promise<AddStreamMembersResult> {
  return addMembersToStream(params);
}
