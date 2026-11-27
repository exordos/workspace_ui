import type { UserPickerOption } from "~/shared/lib/user-picker";

export interface AddStreamMembersParams {
  streamName: string;
  userIds: number[];
}

export interface AddStreamMembersResult {
  ok: boolean;
  addedUserIds: number[];
  alreadySubscribedUserIds: number[];
  unauthorizedStreams: string[];
  errorCode?: string;
}

export type { UserPickerOption };

export interface AddStreamMembersSubmitOptions {
  onSuccess?: (streamId: number) => void;
}
