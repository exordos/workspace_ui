// remove-stream-members domain types — shared contract for UI and store.
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
