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

const pendingRequests = new Map<string, PendingRequest>();

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
