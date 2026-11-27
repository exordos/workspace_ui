// remove-stream-members domain types — shared contract for UI and store.
export interface RemoveStreamMembersParams {
  streamName: string;
  userIds: number[];
}

export interface RemoveStreamMembersResult {
  ok: boolean;
  removedUserIds: number[];
  alreadyUnsubscribedUserIds: number[];
  unauthorizedStreams: string[];
  errorCode?: string;
}

export interface RemoveStreamMemberSubmitOptions {
  streamId: number;
  streamName: string;
  userId: number;
  onSuccess?: (streamId: number) => void;
}
