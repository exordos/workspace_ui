// API-адаптер remove-stream-members feature.
// Делегирует вызов в shared/api слой, чтобы UI/store не зависели от transport-деталей.
import {
  removeMembersFromStream,
  type RemoveStreamMembersParams,
  type RemoveStreamMembersResult,
} from "~/shared/api/zulip-streams";

// Выполняет удаление участников канала через доменный API-контракт.
export async function removeStreamMembers(
  params: RemoveStreamMembersParams,
): Promise<RemoveStreamMembersResult> {
  return removeMembersFromStream(params);
}
