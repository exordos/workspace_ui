import React, { useMemo } from "react";
import { buildMessengerRequestOptions } from "~/entities/messenger/messenger-request-options.lib";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { useWorkspaceAvatarUrl } from "~/shared/lib/workspace-avatar.lib";
import { Avatar } from "~/shared/ui/avatar";
import type { AvatarProps } from "~/shared/ui/avatar.types";

export interface WorkspaceAvatarProps extends Omit<AvatarProps, "src"> {
  avatarUrn: string | null | undefined;
}

export const WorkspaceAvatar = React.memo(function WorkspaceAvatar({
  avatarUrn,
  ...avatarProps
}: WorkspaceAvatarProps) {
  const sessions = useWorkspaceAuthStore((state) => state.sessions);
  const currentAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  const runtimeContext = useMemo(
    () => selectCurrentWorkspaceRuntimeContext({ sessions, currentAccountId }),
    [currentAccountId, sessions],
  );
  const requestOptions = useMemo(
    () => (runtimeContext == null ? null : buildMessengerRequestOptions(runtimeContext)),
    [runtimeContext],
  );
  const avatarUrl = useWorkspaceAvatarUrl({
    avatarUrn,
    ownerKey: runtimeContext == null ? "" : workspaceRuntimeOwnerKey(runtimeContext),
    runtimeGeneration: runtimeContext?.runtimeGeneration ?? 0,
    requestOptions,
  });
  return <Avatar {...avatarProps} src={avatarUrl} />;
});

WorkspaceAvatar.displayName = "WorkspaceAvatar";
