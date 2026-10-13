import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestInvalidated,
  workspaceRuntimeOwnerKey,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { MessengerApiError } from "~/shared/api/messenger-transport.internal";
import type { OwnProfile } from "~/shared/api/own-profile.types";
import { isProfileDraftValid, profileDraft, profilePatch } from "./user-profile-editor.lib";
import { loadOwnProfile, updateOwnProfile } from "./user-profile.api";
import type { ProfileDraft, ProfileEditableField } from "./user-profile-editor.lib";

type EditorError = "forbidden" | "invalid" | "unsupported" | "transient";
interface EditorState {
  key: string;
  profile: OwnProfile | null;
  draft: ProfileDraft | null;
  loading: boolean;
  saving: boolean;
  error: EditorError | null;
  refreshPending: boolean;
}

function currentRuntime() {
  return useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
}
function runtimeKey(runtime: WorkspaceRuntimeContext | null): string {
  return runtime == null ? "" : `${workspaceRuntimeOwnerKey(runtime)}:${runtime.runtimeGeneration}`;
}
function loadError(error: unknown): EditorError {
  if (error instanceof MessengerApiError) {
    if ([401, 403].includes(error.status)) return "forbidden";
    if ([404, 405, 501].includes(error.status)) return "unsupported";
  }
  return "transient";
}

export function useOwnProfileEditor(runtime: WorkspaceRuntimeContext | null, enabled: boolean) {
  const key = runtimeKey(runtime);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [state, setState] = useState<EditorState>({
    key: "",
    profile: null,
    draft: null,
    loading: false,
    saving: false,
    error: null,
    refreshPending: false,
  });
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled || !key) return;
    const context = currentRuntime();
    if (context == null || runtimeKey(context) !== key) return;
    const request = captureWorkspaceRuntimeRequestContext(currentRuntime);
    const controller = new AbortController();
    requestRef.current = controller;
    setState({
      key,
      profile: null,
      draft: null,
      loading: true,
      saving: false,
      error: null,
      refreshPending: false,
    });
    void loadOwnProfile(context, controller.signal)
      .then((profile) => {
        if (isWorkspaceRuntimeRequestInvalidated(request, currentRuntime, controller.signal))
          return;
        setState((previous) => ({
          ...previous,
          profile,
          draft: profileDraft(profile),
          loading: false,
        }));
      })
      .catch((error: unknown) => {
        if (isWorkspaceRuntimeRequestInvalidated(request, currentRuntime, controller.signal))
          return;
        setState((previous) => ({ ...previous, loading: false, error: loadError(error) }));
      });
    return () => {
      controller.abort();
      requestRef.current?.abort();
      requestRef.current = null;
    };
  }, [enabled, key, reloadVersion]);

  const active = state.key === key && enabled;
  const draft = active ? state.draft : null;
  const profile = active ? state.profile : null;
  const patch = useMemo(
    () => (profile != null && draft != null ? profilePatch(profileDraft(profile), draft) : {}),
    [profile, draft],
  );
  const dirty = Object.keys(patch).length > 0;
  const valid = draft != null && isProfileDraftValid(draft);

  const change = useCallback(
    (field: ProfileEditableField, value: string) => {
      setState((previous) =>
        previous.key === key && previous.draft != null && !previous.saving
          ? { ...previous, draft: { ...previous.draft, [field]: value }, error: null }
          : previous,
      );
    },
    [key],
  );
  const cancel = useCallback(() => {
    setState((previous) =>
      previous.profile == null || previous.saving
        ? previous
        : { ...previous, draft: profileDraft(previous.profile), error: null },
    );
  }, []);
  const reload = useCallback(() => setReloadVersion((version) => version + 1), []);

  const save = useCallback(async (): Promise<boolean> => {
    if (!dirty) return true;
    const context = currentRuntime();
    if (
      !valid ||
      state.saving ||
      requestRef.current?.signal.aborted ||
      context == null ||
      runtimeKey(context) !== key
    )
      return false;
    const request = captureWorkspaceRuntimeRequestContext(currentRuntime);
    const controller = new AbortController();
    requestRef.current = controller;
    setState((previous) => ({ ...previous, saving: true, error: null }));
    try {
      const result = await updateOwnProfile(context, patch, controller.signal);
      if (isWorkspaceRuntimeRequestInvalidated(request, currentRuntime, controller.signal))
        return false;
      if (!result.ok) {
        const kind = result.kind;
        setState((previous) => ({
          ...previous,
          saving: false,
          error: kind === "stale" ? "transient" : kind,
        }));
        return false;
      }
      setState((previous) => ({
        ...previous,
        profile: result.profile,
        draft: profileDraft(result.profile),
        saving: false,
        refreshPending: result.refreshPending,
      }));
      return true;
    } catch (error: unknown) {
      if (!isWorkspaceRuntimeRequestInvalidated(request, currentRuntime, controller.signal)) {
        setState((previous) => ({ ...previous, saving: false, error: loadError(error) }));
      }
      return false;
    }
  }, [dirty, key, patch, state.saving, valid]);

  return {
    profile,
    draft,
    dirty,
    valid,
    change,
    cancel,
    save,
    reload,
    loading: active && state.loading,
    saving: active && state.saving,
    error: active ? state.error : null,
    refreshPending: active && state.refreshPending,
  };
}
