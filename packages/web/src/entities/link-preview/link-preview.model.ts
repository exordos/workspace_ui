/**
 * Per-message link preview cache (Zulip unfurl via messages/render on full markdown).
 *
 * Usage:
 *   import { useLinkPreviewStore } from "~/entities/link-preview/link-preview.model";
 */
import { create } from "zustand";
import { logStoreAction } from "~/shared/lib/logger";
import { fetchLinkPreviewsFromMessageMarkdown } from "~/shared/lib/message-link-preview-fetch.lib";
import { linkPreviewContentFingerprint } from "~/shared/lib/message-link-preview-fingerprint.lib";
import { traceLinkPreview } from "~/shared/lib/message-link-preview-trace.lib";
import { linkPreviewUrlKey } from "~/shared/lib/message-link-preview-url-match.lib";
import type {
  LinkPreviewCacheEntry,
  LinkPreviewCacheStatus,
  LinkPreviewResolvedItem,
} from "~/shared/lib/message-link-preview.types";
import { sliceAfterPreviewFetchAborted, sliceAfterPreviewResolved } from "./link-preview-store.lib";

const DEFAULT_MAX_ENTRIES = 100;

const abortByMessageId = new Map<number, AbortController>();

interface LinkPreviewState {
  byMessageId: Record<number, LinkPreviewCacheEntry>;
  maxEntries: number;
  inFlight: Map<number, Promise<LinkPreviewCacheEntry>>;
  requestPreviewForMessage: (messageId: number, markdown: string) => Promise<LinkPreviewCacheEntry>;
  cancelPreviewForMessage: (messageId: number) => void;
  getEntry: (messageId: number) => LinkPreviewCacheEntry | undefined;
  clear: () => void;
  setMaxEntriesForTests: (max: number) => void;
}

function evictOldestEntries(
  entries: Record<number, LinkPreviewCacheEntry>,
  maxEntries: number,
): Record<number, LinkPreviewCacheEntry> {
  const keys = Object.keys(entries)
    .map(Number)
    .filter((id) => Number.isInteger(id));
  if (keys.length <= maxEntries) {
    return entries;
  }
  const sorted = [...keys].sort((a, b) => entries[a]!.fetchedAt - entries[b]!.fetchedAt);
  const keepIds = sorted.slice(sorted.length - maxEntries);
  const trimmed: Record<number, LinkPreviewCacheEntry> = {};
  for (const id of keepIds) {
    trimmed[id] = entries[id]!;
  }
  return trimmed;
}

function touchMessageEntry(
  entries: Record<number, LinkPreviewCacheEntry>,
  messageId: number,
  entry: LinkPreviewCacheEntry,
  maxEntries: number,
): Record<number, LinkPreviewCacheEntry> {
  const rest = { ...entries };
  delete rest[messageId];
  const next: Record<number, LinkPreviewCacheEntry> = { ...rest, [messageId]: entry };
  return evictOldestEntries(next, maxEntries);
}

function resolveCacheStatus(items: LinkPreviewResolvedItem[]): LinkPreviewCacheStatus {
  if (items.some((item) => item.data != null)) {
    return "ready";
  }
  return "unavailable";
}

function mergeResolvedItems(
  incoming: LinkPreviewResolvedItem[],
  previous: LinkPreviewResolvedItem[] | undefined,
): LinkPreviewResolvedItem[] {
  if (previous == null || previous.length === 0) {
    return incoming;
  }
  const prevByUrl = new Map(previous.map((item) => [linkPreviewUrlKey(item.targetUrl), item]));
  return incoming.map((item) => {
    if (item.data != null) {
      return item;
    }
    const kept = prevByUrl.get(linkPreviewUrlKey(item.targetUrl));
    return kept?.data != null ? kept : item;
  });
}

function entryHasPreviewData(entry: LinkPreviewCacheEntry): boolean {
  return entry.items.some((item) => item.data != null);
}

/** Empty `loading` left after abort/unmount — must not block the next fetch. */
function isStaleLoadingCacheEntry(entry: LinkPreviewCacheEntry | undefined): boolean {
  return entry?.status === "loading" && !entryHasPreviewData(entry);
}

function removeMessageCacheEntry(
  entries: Record<number, LinkPreviewCacheEntry>,
  messageId: number,
): Record<number, LinkPreviewCacheEntry> {
  if (entries[messageId] == null) {
    return entries;
  }
  const next = { ...entries };
  delete next[messageId];
  return next;
}

function endFetchAbort(messageId: number, controller: AbortController): void {
  if (abortByMessageId.get(messageId) === controller) {
    abortByMessageId.delete(messageId);
  }
}

export const useLinkPreviewStore = create<LinkPreviewState>((set, get) => ({
  byMessageId: {},
  maxEntries: DEFAULT_MAX_ENTRIES,
  inFlight: new Map(),

  getEntry(messageId) {
    return get().byMessageId[messageId];
  },

  cancelPreviewForMessage(messageId) {
    abortByMessageId.get(messageId)?.abort();
    abortByMessageId.delete(messageId);
    set((state) => {
      const entry = state.byMessageId[messageId];
      const nextInFlight = new Map(state.inFlight);
      nextInFlight.delete(messageId);
      if (!isStaleLoadingCacheEntry(entry)) {
        return { inFlight: nextInFlight };
      }
      traceLinkPreview("store:cancel-clear-stale-loading", { messageId });
      return {
        inFlight: nextInFlight,
        byMessageId: removeMessageCacheEntry(state.byMessageId, messageId),
      };
    });
  },

  async requestPreviewForMessage(messageId, markdown) {
    const fingerprint = linkPreviewContentFingerprint(markdown);
    const existing = get().byMessageId[messageId];
    if (
      existing?.contentFingerprint === fingerprint &&
      (existing.status === "ready" || existing.status === "unavailable")
    ) {
      traceLinkPreview("store:cache-return", {
        messageId,
        status: existing.status,
        fingerprint,
        itemCount: existing.items.length,
      });
      return existing;
    }

    const inFlight = get().inFlight.get(messageId);
    if (inFlight != null) {
      return inFlight;
    }

    abortByMessageId.get(messageId)?.abort();
    const abortController = new AbortController();
    abortByMessageId.set(messageId, abortController);
    const signal = abortController.signal;

    logStoreAction("linkPreview", "requestPreviewForMessage", { messageId });
    traceLinkPreview("store:loading", { messageId, fingerprint });
    set((state) => ({
      byMessageId: touchMessageEntry(
        state.byMessageId,
        messageId,
        {
          status: "loading",
          items: [],
          contentFingerprint: fingerprint,
          fetchedAt: Date.now(),
        },
        state.maxEntries,
      ),
    }));

    const request = (async (): Promise<LinkPreviewCacheEntry> => {
      const items = await fetchLinkPreviewsFromMessageMarkdown(markdown, messageId, signal);
      if (signal.aborted) {
        endFetchAbort(messageId, abortController);
        set((state) => sliceAfterPreviewFetchAborted(state, messageId));
        const remaining = get().byMessageId[messageId];
        return (
          remaining ?? {
            status: "idle",
            items: [],
            contentFingerprint: fingerprint,
            fetchedAt: Date.now(),
          }
        );
      }

      const status = resolveCacheStatus(items);
      const entry: LinkPreviewCacheEntry = {
        status,
        items,
        contentFingerprint: fingerprint,
        fetchedAt: Date.now(),
      };
      set((state) =>
        sliceAfterPreviewResolved({
          state,
          messageId,
          fingerprint,
          entry,
          touchMessageEntry,
          mergeResolvedItems,
          resolveCacheStatus,
          entryHasPreviewData,
        }),
      );
      endFetchAbort(messageId, abortController);
      const stored = get().byMessageId[messageId];
      if (stored == null) {
        traceLinkPreview("store:missing-after-resolve", { messageId, fingerprint });
      }
      return stored ?? entry;
    })();

    set((state) => {
      const next = new Map(state.inFlight);
      next.set(messageId, request);
      return { inFlight: next };
    });

    return request;
  },

  clear() {
    for (const controller of abortByMessageId.values()) {
      controller.abort();
    }
    abortByMessageId.clear();
    set({ byMessageId: {}, inFlight: new Map() });
  },

  setMaxEntriesForTests(max) {
    set({ maxEntries: max });
  },
}));
