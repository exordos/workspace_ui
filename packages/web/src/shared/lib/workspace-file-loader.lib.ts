import { downloadWorkspaceFile } from "~/shared/api/messenger-files.api";
import type {
  MessengerBinaryResult,
  MessengerClientOptions,
} from "~/shared/api/messenger-transport.internal";

export interface WorkspaceFileLoaderOptions {
  ownerKey: string;
  runtimeGeneration: number;
  fileUuid: string;
  requestOptions: MessengerClientOptions;
  signal?: AbortSignal;
}

interface Consumer {
  settled: boolean;
  onAbort: () => void;
  signal?: AbortSignal;
}

interface PendingRequest {
  key: string;
  controller: AbortController;
  consumers: Set<Consumer>;
  promise: Promise<MessengerBinaryResult>;
}

export interface WorkspaceFileResourceCache {
  load(options: WorkspaceFileLoaderOptions): Promise<MessengerBinaryResult>;
  clear(): void;
}

interface ResourceCacheEntry {
  abortController: AbortController;
  promise: Promise<MessengerBinaryResult>;
  invalidationVersion: number;
}

const pendingRequests = new Map<string, PendingRequest>();
const invalidationVersionsByFileKey = new Map<string, number>();

function fileCacheKey(ownerKey: string, fileUuid: string): string {
  return JSON.stringify([ownerKey, fileUuid]);
}

function currentInvalidationVersion(ownerKey: string, fileUuid: string): number {
  return invalidationVersionsByFileKey.get(fileCacheKey(ownerKey, fileUuid)) ?? 0;
}

// Realtime file mutations do not have a metadata store. Bump this version so the
// next preview/download cannot reuse bytes fetched before the mutation.
export function invalidateWorkspaceFileResourceCache(ownerKey: string, fileUuid: string): void {
  const key = fileCacheKey(ownerKey, fileUuid);
  invalidationVersionsByFileKey.set(key, (invalidationVersionsByFileKey.get(key) ?? 0) + 1);
}

function requestKey(options: WorkspaceFileLoaderOptions): string {
  return JSON.stringify([options.ownerKey, options.runtimeGeneration, options.fileUuid]);
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The operation was aborted", "AbortError");
}

function removeConsumer(request: PendingRequest, consumer: Consumer): void {
  request.consumers.delete(consumer);
  if (request.consumers.size > 0) {
    return;
  }

  if (pendingRequests.get(request.key) === request) {
    pendingRequests.delete(request.key);
  }
  request.controller.abort();
}

function createPendingRequest(options: WorkspaceFileLoaderOptions): PendingRequest {
  const key = requestKey(options);
  const controller = new AbortController();
  const promise = downloadWorkspaceFile(
    { ...options.requestOptions, signal: controller.signal },
    options.fileUuid,
  );

  const request: PendingRequest = {
    key,
    controller,
    consumers: new Set(),
    promise,
  };

  void promise.then(
    () => {
      if (pendingRequests.get(key) === request) {
        pendingRequests.delete(key);
      }
    },
    () => {
      if (pendingRequests.get(key) === request) {
        pendingRequests.delete(key);
      }
    },
  );

  pendingRequests.set(key, request);
  return request;
}

export function loadWorkspaceFile(
  options: WorkspaceFileLoaderOptions,
): Promise<MessengerBinaryResult> {
  if (options.signal?.aborted) {
    return Promise.reject(abortReason(options.signal));
  }

  const key = requestKey(options);
  const request = pendingRequests.get(key) ?? createPendingRequest(options);

  return new Promise<MessengerBinaryResult>((resolve, reject) => {
    const consumer: Consumer = {
      settled: false,
      onAbort: () => {
        if (consumer.settled) {
          return;
        }
        consumer.settled = true;
        consumer.signal?.removeEventListener("abort", consumer.onAbort);
        removeConsumer(request, consumer);
        reject(
          consumer.signal == null
            ? new DOMException("The operation was aborted", "AbortError")
            : abortReason(consumer.signal),
        );
      },
      signal: options.signal,
    };

    request.consumers.add(consumer);
    options.signal?.addEventListener("abort", consumer.onAbort, { once: true });
    if (options.signal?.aborted) {
      consumer.onAbort();
      return;
    }

    void request.promise.then(
      (result) => {
        if (consumer.settled) {
          return;
        }
        consumer.settled = true;
        consumer.signal?.removeEventListener("abort", consumer.onAbort);
        request.consumers.delete(consumer);
        resolve(result);
      },
      (error: unknown) => {
        if (consumer.settled) {
          return;
        }
        consumer.settled = true;
        consumer.signal?.removeEventListener("abort", consumer.onAbort);
        request.consumers.delete(consumer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

function waitForResource(
  promise: Promise<MessengerBinaryResult>,
  signal: AbortSignal | undefined,
): Promise<MessengerBinaryResult> {
  if (signal == null) {
    return promise;
  }
  if (signal.aborted) {
    return Promise.reject(abortReason(signal));
  }

  return new Promise<MessengerBinaryResult>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(abortReason(signal));
    };

    signal.addEventListener("abort", onAbort, { once: true });
    void promise.then(
      (result) => {
        signal.removeEventListener("abort", onAbort);
        if (signal.aborted) {
          reject(abortReason(signal));
          return;
        }
        resolve(result);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

export function createWorkspaceFileResourceCache(): WorkspaceFileResourceCache {
  const entries = new Map<string, ResourceCacheEntry>();

  return {
    load(options) {
      if (options.signal?.aborted) {
        return Promise.reject(abortReason(options.signal));
      }

      const key = requestKey(options);
      let entry = entries.get(key);
      const invalidationVersion = currentInvalidationVersion(options.ownerKey, options.fileUuid);
      if (entry != null && entry.invalidationVersion !== invalidationVersion) {
        entry.abortController.abort();
        entries.delete(key);
        entry = undefined;
      }
      if (entry == null) {
        const abortController = new AbortController();
        const promise = loadWorkspaceFile({
          ...options,
          signal: abortController.signal,
        }).catch((error: unknown) => {
          if (entries.get(key)?.promise === promise) {
            entries.delete(key);
          }
          throw error instanceof Error ? error : new Error(String(error));
        });
        entry = {
          abortController,
          promise,
          invalidationVersion,
        };
        entries.set(key, entry);
      }

      return waitForResource(entry.promise, options.signal);
    },

    clear() {
      for (const entry of entries.values()) {
        entry.abortController.abort();
      }
      entries.clear();
    },
  };
}
