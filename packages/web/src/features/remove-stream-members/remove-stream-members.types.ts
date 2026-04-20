// Типы remove-stream-members feature.
// Нужны, чтобы UI и store работали с единым доменным контрактом удаления участников.
import type {
  RemoveStreamMembersParams,
  RemoveStreamMembersResult,
} from "~/shared/api/zulip-streams";

export type { RemoveStreamMembersParams, RemoveStreamMembersResult };

export interface RemoveStreamMemberSubmitOptions {
  streamId: number;
  streamName: string;
  userId: number;
  onSuccess?: (streamId: number) => void;
}
