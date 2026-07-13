import { useEffect, useState } from "react";
import type { MessengerClientOptions } from "~/shared/api/messenger-transport.internal";
import { resolveWorkspaceAvatarSource } from "./workspace-avatar-urn.lib";
import { loadWorkspaceFile } from "./workspace-file-loader.lib";

export interface WorkspaceAvatarRuntimeScope {
  ownerKey: string;
  runtimeGeneration: number;
}

export interface LoadWorkspaceAvatarOptions extends WorkspaceAvatarRuntimeScope {
  avatarUrn: string | null | undefined;
  requestOptions: MessengerClientOptions;
  signal?: AbortSignal;
}

export interface WorkspaceAvatarResource {
  url: string;
  dispose: () => void;
}

export interface UseWorkspaceAvatarUrlOptions extends WorkspaceAvatarRuntimeScope {
  avatarUrn: string | null | undefined;
  requestOptions: MessengerClientOptions | null;
}

export async function loadWorkspaceAvatar(
  options: LoadWorkspaceAvatarOptions,
): Promise<WorkspaceAvatarResource | null> {
  const source = resolveWorkspaceAvatarSource(options.avatarUrn);
  if (source == null) {
    return null;
  }

  if (source.kind === "external") {
    return { url: source.url, dispose: () => undefined };
  }

  // The caller aborts this request when the owner or runtime generation changes.
  if (options.ownerKey.trim().length === 0 || !Number.isInteger(options.runtimeGeneration)) {
    return null;
  }

  const result = await loadWorkspaceFile({
    ownerKey: options.ownerKey,
    runtimeGeneration: options.runtimeGeneration,
    fileUuid: source.fileUuid,
    requestOptions: options.requestOptions,
    signal: options.signal,
  });
  const objectUrl = URL.createObjectURL(result.blob);
  let disposed = false;
  return {
    url: objectUrl,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      URL.revokeObjectURL(objectUrl);
    },
  };
}

export function useWorkspaceAvatarUrl(options: UseWorkspaceAvatarUrlOptions): string | undefined {
  const [loadedUrl, setLoadedUrl] = useState<string>();

  useEffect(() => {
    let active = true;
    let resource: WorkspaceAvatarResource | null = null;
    const controller = new AbortController();
    const source = resolveWorkspaceAvatarSource(options.avatarUrn);

    setLoadedUrl(undefined);
    if (source == null) {
      return () => {
        active = false;
        controller.abort();
      };
    }

    if (source.kind === "external") {
      setLoadedUrl(source.url);
      return () => {
        active = false;
        controller.abort();
      };
    }

    if (options.requestOptions == null || options.ownerKey.trim().length === 0) {
      return () => {
        active = false;
        controller.abort();
      };
    }

    void loadWorkspaceAvatar({
      ...options,
      requestOptions: options.requestOptions,
      signal: controller.signal,
    })
      .then((nextResource) => {
        if (!active || controller.signal.aborted) {
          nextResource?.dispose();
          return;
        }
        resource = nextResource;
        setLoadedUrl(nextResource?.url);
      })
      .catch(() => {
        if (active && !controller.signal.aborted) {
          setLoadedUrl(undefined);
        }
      });

    return () => {
      active = false;
      controller.abort();
      resource?.dispose();
    };
  }, [options.avatarUrn, options.ownerKey, options.requestOptions, options.runtimeGeneration]);

  return loadedUrl;
}
