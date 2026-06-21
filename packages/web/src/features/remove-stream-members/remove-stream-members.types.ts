// remove-stream-members domain types — shared contract for UI and store.
import type {
  RemoveStreamMembersParams,
  RemoveStreamMembersResult,
} from "~/shared/api/messenger-streams";

export type { RemoveStreamMembersParams, RemoveStreamMembersResult };

export interface RemoveStreamMemberSubmitOptions {
  streamId: string;
  streamName: string;
  userId: number;
  onSuccess?: (streamId: string) => void;
}
