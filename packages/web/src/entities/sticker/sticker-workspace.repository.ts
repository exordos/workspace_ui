import { buildMessengerRequestOptions } from "~/entities/messenger/messenger-request-options.lib";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { MessengerClientOptions } from "~/shared/api/messenger-client";
import { getStickersPage } from "~/shared/api/messenger-stickers.api";
import type { StickerListQuery, WorkspaceStickerDto } from "~/shared/api/messenger-stickers.api";
import type { Sticker } from "./sticker.types";

export function stickerRuntimeKey(): string | null {
  const context = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
  return context == null
    ? null
    : `${workspaceRuntimeOwnerKey(context)}:${context.runtimeGeneration}`;
}
export function stickerRequestOptions(signal?: AbortSignal): MessengerClientOptions {
  const context = useWorkspaceAuthStore.getState().getCurrentRuntimeContext();
  if (context == null) throw new Error("Workspace session is required");
  return buildMessengerRequestOptions(context, undefined, signal);
}
export function stickerFromDto(dto: WorkspaceStickerDto): Sticker {
  return {
    id: dto.id,
    reference: { kind: "workspace", stickerId: dto.id },
    title: dto.title,
    alt: dto.alt_text,
    emoji: dto.emoji,
    tags: dto.tags,
    category: dto.category,
    isFavorite: dto.is_favorite,
    format: dto.media.format,
    url: dto.media.url,
    media: {
      width: dto.media.width,
      height: dto.media.height,
      aspectRatio:
        dto.media.width && dto.media.height ? dto.media.width / dto.media.height : undefined,
    },
  };
}
export async function loadWorkspaceStickerPage(query: StickerListQuery, signal?: AbortSignal) {
  const key = stickerRuntimeKey();
  const page = await getStickersPage(stickerRequestOptions(signal), query);
  signal?.throwIfAborted();
  if (key !== stickerRuntimeKey()) throw new DOMException("Stale sticker request", "AbortError");
  return { ...page, items: page.items.map(stickerFromDto) };
}

interface Pending {
  resolve: (sticker: Sticker | null) => void;
  reject: (error: unknown) => void;
  promise: Promise<Sticker | null>;
}

async function resolvePages(
  ids: string[],
  options: MessengerClientOptions,
  isCurrent: () => boolean,
): Promise<Map<string, Sticker>> {
  const found = new Map<string, Sticker>();
  for (let offset = 0; offset < ids.length; offset += 100) {
    const uuid = ids.slice(offset, offset + 100);
    let pageMarker: string | undefined;
    const markers = new Set<string>();
    do {
      const page = await getStickersPage(options, { uuid, pageLimit: 100, pageMarker });
      if (!isCurrent()) throw new DOMException("Stale sticker batch", "AbortError");
      for (const dto of page.items) found.set(dto.id, stickerFromDto(dto));
      pageMarker = page.nextPageMarker ?? undefined;
      if (pageMarker && markers.has(pageMarker))
        throw new Error("Repeated sticker pagination marker");
      if (pageMarker) markers.add(pageMarker);
    } while (pageMarker);
  }
  return found;
}

export function createWorkspaceStickerResolver(
  getOptions = stickerRequestOptions,
  getKey = stickerRuntimeKey,
) {
  const pending = new Map<string, Map<string, Pending>>();
  const inFlight = new Map<string, Pending>();
  async function flush(key: string, batch: Map<string, Pending>) {
    const ids = [...batch.keys()];
    try {
      if (getKey() !== key) throw new DOMException("Stale sticker batch", "AbortError");
      const options = getOptions();
      const found = await resolvePages(ids, options, () => getKey() === key);
      for (const [id, entry] of batch) entry.resolve(found.get(id) ?? null);
    } catch (error) {
      for (const entry of batch.values())
        entry.reject(
          error instanceof Error || error instanceof DOMException
            ? error
            : new Error("Sticker resolution failed", { cause: error }),
        );
    } finally {
      for (const id of batch.keys()) inFlight.delete(`${key}:${id}`);
    }
  }
  return async (id: string, signal?: AbortSignal): Promise<Sticker | null> => {
    signal?.throwIfAborted();
    const key = getKey();
    if (key == null) throw new Error("Workspace session is required");
    const existing = inFlight.get(`${key}:${id}`);
    if (existing) {
      const result = await awaitResolution(existing.promise, signal);
      if (key !== getKey()) throw new DOMException("Stale sticker resolution", "AbortError");
      return result;
    }
    let batch = pending.get(key);
    if (!batch) {
      batch = new Map();
      pending.set(key, batch);
      const queued = batch;
      queueMicrotask(() => {
        pending.delete(key);
        void flush(key, queued);
      });
    }
    let entry = batch.get(id);
    if (!entry) {
      let resolve!: Pending["resolve"];
      let reject!: Pending["reject"];
      const promise = new Promise<Sticker | null>((_resolve, _reject) => {
        resolve = _resolve;
        reject = _reject;
      });
      entry = { promise, resolve, reject };
      batch.set(id, entry);
      inFlight.set(`${key}:${id}`, entry);
    }
    const result = await awaitResolution(entry.promise, signal);
    signal?.throwIfAborted();
    if (key !== getKey()) throw new DOMException("Stale sticker resolution", "AbortError");
    return result;
  };
}

function awaitResolution(
  promise: Promise<Sticker | null>,
  signal?: AbortSignal,
): Promise<Sticker | null> {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException("Sticker resolution cancelled", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    void promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(
          error instanceof Error || error instanceof DOMException
            ? error
            : new Error("Sticker resolution failed", { cause: error }),
        );
      },
    );
  });
}
