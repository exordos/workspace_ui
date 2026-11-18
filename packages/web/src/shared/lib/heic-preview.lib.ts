import workerUrl from "./heic-preview.worker?worker&url";
import type { HeicPreviewResult } from "./heic-preview.worker.types";

export { isHeicAttachment } from "./heic-preview-format.lib";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const DECODE_TIMEOUT_MS = 15_000;
const WORKER_IDLE_TIMEOUT_MS = 15_000;

interface PreviewJob {
  blob: Blob;
  complete: (result: Blob) => void;
  fail: (error: Error) => void;
}

const queue: PreviewJob[] = [];
let activeJob: PreviewJob | undefined;
let worker: Worker | undefined;
let workerBootstrapUrl: string | undefined;
let workerTimer: ReturnType<typeof setTimeout> | undefined;

function releaseWorkerBootstrap(): void {
  if (workerBootstrapUrl == null) return;
  URL.revokeObjectURL(workerBootstrapUrl);
  workerBootstrapUrl = undefined;
}

function stopWorker(): void {
  clearTimeout(workerTimer);
  worker?.terminate();
  worker = undefined;
  releaseWorkerBootstrap();
}

function failActiveJob(error: Error): void {
  const job = activeJob;
  activeJob = undefined;
  stopWorker();
  job?.fail(error);
  queueMicrotask(runNextJob);
}

function createWorker(): Worker {
  const assetUrl = new URL(workerUrl, globalThis.location.href);
  if (import.meta.env.DEV) return new Worker(assetUrl, { type: "module" });
  if (assetUrl.origin === globalThis.location.origin) return new Worker(assetUrl);

  // A classic Worker's entry must be same-origin even when Vite serves assets from a CDN.
  const bootstrap = new Blob([`importScripts(${JSON.stringify(assetUrl.href)});`], {
    type: "text/javascript",
  });
  workerBootstrapUrl = URL.createObjectURL(bootstrap);
  return new Worker(workerBootstrapUrl);
}

function startWorker(): Worker {
  const instance = createWorker();
  instance.onmessage = (event: MessageEvent<HeicPreviewResult>) => {
    if (worker !== instance || activeJob == null) return;
    releaseWorkerBootstrap();
    const job = activeJob;
    activeJob = undefined;
    clearTimeout(workerTimer);
    if (event.data.ok) {
      job.complete(event.data.preview);
    } else {
      job.fail(new Error("Could not decode HEIC preview"));
    }
    runNextJob();
  };
  const handleWorkerError = () => {
    if (worker === instance) {
      failActiveJob(new Error("HEIC preview worker failed"));
    }
  };
  instance.onerror = handleWorkerError;
  instance.onmessageerror = handleWorkerError;
  return instance;
}

function runNextJob(): void {
  if (activeJob != null) return;
  const job = queue.shift();
  if (job == null) {
    if (worker != null) {
      clearTimeout(workerTimer);
      workerTimer = setTimeout(stopWorker, WORKER_IDLE_TIMEOUT_MS);
    }
    return;
  }

  clearTimeout(workerTimer);
  activeJob = job;
  try {
    worker ??= startWorker();
    worker.postMessage(job.blob);
    workerTimer = setTimeout(() => {
      failActiveJob(new Error("HEIC preview timed out"));
    }, DECODE_TIMEOUT_MS);
  } catch (error) {
    failActiveJob(error instanceof Error ? error : new Error("Could not start HEIC preview"));
  }
}

export async function createHeicPreview(
  blob: Blob,
  { signal }: { signal?: AbortSignal } = {},
): Promise<Blob> {
  signal?.throwIfAborted();
  if (blob.size === 0 || blob.size > MAX_FILE_BYTES) {
    throw new Error("HEIC file exceeds preview limits");
  }

  return new Promise((resolve, reject) => {
    function abort(): void {
      if (activeJob === job) {
        // The WASM call is synchronous. A message cannot interrupt an active decode.
        activeJob = undefined;
        stopWorker();
      } else {
        const index = queue.indexOf(job);
        if (index >= 0) queue.splice(index, 1);
      }
      const reason: unknown = signal?.reason;
      job.fail(
        reason instanceof Error ? reason : new DOMException("HEIC preview aborted", "AbortError"),
      );
      runNextJob();
    }

    const job: PreviewJob = {
      blob,
      complete: (preview) => {
        signal?.removeEventListener("abort", abort);
        resolve(preview);
      },
      fail: (error) => {
        signal?.removeEventListener("abort", abort);
        reject(error);
      },
    };
    signal?.addEventListener("abort", abort, { once: true });
    queue.push(job);
    runNextJob();
  });
}
