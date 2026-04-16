import type { AddStreamMembersParams, AddStreamMembersResult } from "~/shared/api/zulip-streams";
import type { UserPickerOption } from "~/shared/lib/user-picker";

export type { AddStreamMembersParams, AddStreamMembersResult, UserPickerOption };

export interface AddStreamMembersSubmitOptions {
  onSuccess?: (streamId: number) => void;
}
