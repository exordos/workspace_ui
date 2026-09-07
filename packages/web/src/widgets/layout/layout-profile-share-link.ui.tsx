import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { buildWorkspaceRequestOptions } from "~/entities/messenger/messenger-request-options.lib";
import { applyBootstrapUsers, resolveCachedWorkspaceUser } from "~/entities/user/user-sync.lib";
import { useUsersStore } from "~/entities/user/user.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { t } from "~/i18n/i18n";
import { getUser } from "~/shared/api/workspace-client";
import { parseWorkspaceProfileShareHash } from "~/shared/lib/workspace-profile-link.lib";
import { Button } from "~/shared/ui/button";
import { useRightDrawerStore } from "~/widgets/right-panel/right-drawer.model";

const getRuntimeContext = () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext();

interface ProfileShareRequest {
  controller: AbortController;
  opened: boolean;
}

interface ProfileShareOutcome {
  revision: number;
  failed: boolean;
}

export function LayoutProfileShareLink({
  runtimeContext,
  routeReady,
}: {
  readonly runtimeContext: WorkspaceRuntimeContext | null;
  readonly routeReady: boolean;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const usersOwnerKey = useUsersStore((state) => state.ownerKey);
  const ownerKey = runtimeContext == null ? null : workspaceRuntimeOwnerKey(runtimeContext);
  const userUuid = parseWorkspaceProfileShareHash(location.hash);
  const [outcome, setOutcome] = useState<ProfileShareOutcome>({ revision: 0, failed: false });
  const requestRef = useRef<ProfileShareRequest | null>(null);

  useEffect(() => {
    return () => {
      requestRef.current?.controller.abort();
      requestRef.current = null;
    };
  }, [ownerKey, runtimeContext?.runtimeGeneration]);

  useEffect(() => {
    if (!routeReady || runtimeContext == null || ownerKey == null || userUuid == null) return;
    const requestContext = captureWorkspaceRuntimeRequestContext(() => runtimeContext);
    if (isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext)) return;
    if (useUsersStore.getState().ownerKey !== ownerKey) {
      // Cached profiles belong to the persisted owner even when token refresh is offline.
      useUsersStore.getState().startOwnerSync(ownerKey);
      return;
    }
    const request: ProfileShareRequest = { controller: new AbortController(), opened: false };
    const { controller } = request;
    const isInvalidated = () =>
      requestRef.current !== request ||
      useUsersStore.getState().ownerKey !== ownerKey ||
      isWorkspaceRuntimeRequestInvalidated(requestContext, getRuntimeContext, controller.signal);
    requestRef.current?.controller.abort();
    requestRef.current = request;
    useRightDrawerStore.getState().close();

    const consumeLink = () => {
      void navigate(
        { pathname: location.pathname, search: location.search, hash: "" },
        { replace: true },
      );
    };
    const openProfile = () => {
      if (request.opened || isInvalidated()) return;
      request.opened = true;
      setOutcome(({ revision }) => ({ revision: revision + 1, failed: false }));
      useRightDrawerStore.getState().openWorkspaceUserProfile(userUuid);
      // The refresh may finish after this one-shot navigation, but must never reopen the drawer.
      consumeLink();
    };

    const loadProfile = async () => {
      try {
        if (useUsersStore.getState().usersById[userUuid] != null) {
          openProfile();
        } else {
          const cachedUser = await resolveCachedWorkspaceUser({ ownerKey, userUuid }).catch(
            () => null,
          );
          if (isInvalidated()) return;
          if (
            useUsersStore.getState().usersById[userUuid] != null ||
            (cachedUser?.uuid === userUuid &&
              useUsersStore.getState().upsertUserForOwner(ownerKey, cachedUser))
          ) {
            openProfile();
          }
        }
        if (isInvalidated()) return;
        const user = await getUser(
          buildWorkspaceRequestOptions(runtimeContext, undefined, controller.signal),
          userUuid,
        );
        if (isInvalidated()) return;
        if (user.uuid !== userUuid) {
          throw new Error("Shared profile response does not match the requested user");
        }
        const result = applyBootstrapUsers([user], {
          runtimeContext,
          requestContext,
          getRuntimeContext,
          signal: controller.signal,
          mode: "upsert",
        });
        if (result.status !== "applied") return;
        openProfile();
      } catch {
        if (!request.opened && !isInvalidated()) {
          if (useUsersStore.getState().usersById[userUuid] != null) {
            openProfile();
            return;
          }
          setOutcome(({ revision }) => ({ revision: revision + 1, failed: true }));
          // A failed link is also one-shot; session changes must not replay it.
          consumeLink();
        }
      } finally {
        if (requestRef.current === request) requestRef.current = null;
      }
    };
    void loadProfile();
    return () => {
      // Keep a cached profile's refresh alive when consuming its hash changes the location.
      if (!request.opened) {
        controller.abort();
        if (requestRef.current === request) requestRef.current = null;
      }
    };
  }, [
    location.key,
    location.pathname,
    location.search,
    navigate,
    ownerKey,
    routeReady,
    runtimeContext,
    userUuid,
    usersOwnerKey,
  ]);

  const noticeRouteKey = `${ownerKey ?? ""}\n${location.pathname}\n${location.search}`;
  return <ProfileShareFailureNotice key={noticeRouteKey} outcome={outcome} userUuid={userUuid} />;
}

function ProfileShareFailureNotice({
  outcome,
  userUuid,
}: {
  readonly outcome: ProfileShareOutcome;
  readonly userUuid: string | null;
}) {
  const [initialRevision] = useState(outcome.revision);
  const [dismissedRevision, setDismissedRevision] = useState<number | null>(null);
  if (
    !outcome.failed ||
    outcome.revision === initialRevision ||
    outcome.revision === dismissedRevision ||
    userUuid != null
  )
    return null;
  return (
    <div
      role="alert"
      className="border-notice-base/60 bg-notice-base/20 flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3 text-notice-base"
    >
      <p className="text-sm">{t("info.profileLinkUnavailable")}</p>
      <Button size="sm" variant="neutral" onClick={() => setDismissedRevision(outcome.revision)}>
        {t("common.close")}
      </Button>
    </div>
  );
}
