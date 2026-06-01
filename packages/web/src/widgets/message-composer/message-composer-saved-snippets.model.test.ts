import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedSnippet } from "~/shared/api/zulip.types";
import {
  resetComposerSavedSnippetsModelForTests,
  useComposerSavedSnippetsStore,
} from "./message-composer-saved-snippets.model";

const getCurrentInstanceMock = vi.hoisted(() => vi.fn());
const fetchSavedSnippetsMock = vi.hoisted(() => vi.fn());
const createSavedSnippetMock = vi.hoisted(() => vi.fn());

vi.mock("~/shared/api/client", () => ({
  getCurrentInstance: (...args: unknown[]) => getCurrentInstanceMock(...args),
}));

vi.mock("~/shared/api/zulip-messages", () => ({
  fetchSavedSnippets: (...args: unknown[]) => fetchSavedSnippetsMock(...args),
  createSavedSnippet: (...args: unknown[]) => createSavedSnippetMock(...args),
}));

describe("message-composer-saved-snippets.model", () => {
  beforeEach(() => {
    resetComposerSavedSnippetsModelForTests();
    getCurrentInstanceMock.mockReset();
    getCurrentInstanceMock.mockReturnValue({
      id: "inst-a",
      realm: "https://example.com",
      email: "user@example.com",
      apiKey: "api-key",
    });
    fetchSavedSnippetsMock.mockReset();
    createSavedSnippetMock.mockReset();
    createSavedSnippetMock.mockResolvedValue(101);
    vi.useRealTimers();
  });

  afterEach(() => {
    resetComposerSavedSnippetsModelForTests();
    vi.useRealTimers();
  });

  it("reuses cache for repeated open calls within ttl", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-26T09:00:00.000Z"));
    fetchSavedSnippetsMock.mockResolvedValue([
      { id: 1, title: "Incident", content: "Status update", date_created: 1710000000 },
    ]);

    await useComposerSavedSnippetsStore.getState().openSavedSnippets();
    await useComposerSavedSnippetsStore.getState().openSavedSnippets();

    expect(fetchSavedSnippetsMock).toHaveBeenCalledTimes(1);
  });

  it("keeps stale cache visible and refreshes after ttl expiration", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-26T09:00:00.000Z"));

    fetchSavedSnippetsMock.mockResolvedValueOnce([
      { id: 1, title: "Incident", content: "First", date_created: 1710000000 },
    ]);
    await useComposerSavedSnippetsStore.getState().openSavedSnippets();

    vi.setSystemTime(new Date("2026-03-26T09:01:01.000Z"));
    let resolveRefresh!: (value: SavedSnippet[]) => void;
    fetchSavedSnippetsMock.mockImplementationOnce(
      () =>
        new Promise<SavedSnippet[]>((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    const refreshPromise = useComposerSavedSnippetsStore.getState().openSavedSnippets();

    expect(useComposerSavedSnippetsStore.getState().snippets[0]?.content).toBe("First");
    expect(useComposerSavedSnippetsStore.getState().refreshing).toBe(true);

    resolveRefresh([{ id: 1, title: "Incident", content: "Second", date_created: 1710000001 }]);
    await refreshPromise;

    expect(fetchSavedSnippetsMock).toHaveBeenCalledTimes(2);
    expect(useComposerSavedSnippetsStore.getState().snippets[0]?.content).toBe("Second");
    expect(useComposerSavedSnippetsStore.getState().refreshing).toBe(false);
  });

  it("deduplicates in-flight open requests", async () => {
    let resolveFetch!: (value: SavedSnippet[]) => void;
    fetchSavedSnippetsMock.mockImplementation(
      () =>
        new Promise<SavedSnippet[]>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const first = useComposerSavedSnippetsStore.getState().openSavedSnippets();
    const second = useComposerSavedSnippetsStore.getState().openSavedSnippets();

    expect(fetchSavedSnippetsMock).toHaveBeenCalledTimes(1);
    resolveFetch([{ id: 1, title: "Incident", content: "Status", date_created: 1710000000 }]);
    await Promise.all([first, second]);

    expect(useComposerSavedSnippetsStore.getState().snippets.length).toBe(1);
  });

  it("sets load error when initial fetch fails without cache", async () => {
    fetchSavedSnippetsMock.mockRejectedValue(new Error("network"));

    await useComposerSavedSnippetsStore.getState().openSavedSnippets();

    expect(useComposerSavedSnippetsStore.getState().error).toBe("load_failed");
    expect(useComposerSavedSnippetsStore.getState().snippets).toEqual([]);
    expect(useComposerSavedSnippetsStore.getState().loadingInitial).toBe(false);
  });

  it("keeps cached snippets when refresh fails", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-26T09:00:00.000Z"));

    fetchSavedSnippetsMock.mockResolvedValueOnce([
      { id: 1, title: "Incident", content: "First", date_created: 1710000000 },
    ]);
    await useComposerSavedSnippetsStore.getState().openSavedSnippets();

    vi.setSystemTime(new Date("2026-03-26T09:01:01.000Z"));
    fetchSavedSnippetsMock.mockRejectedValueOnce(new Error("refresh failed"));
    await useComposerSavedSnippetsStore.getState().openSavedSnippets();

    expect(useComposerSavedSnippetsStore.getState().error).toBe("load_failed");
    expect(useComposerSavedSnippetsStore.getState().snippets[0]?.content).toBe("First");
  });

  it("creates snippet optimistically and runs force sync", async () => {
    fetchSavedSnippetsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 333, title: "Bug report", content: "Current draft body", date_created: 1710000002 },
      ]);
    createSavedSnippetMock.mockResolvedValue(333);

    await useComposerSavedSnippetsStore.getState().openSavedSnippets();
    await useComposerSavedSnippetsStore
      .getState()
      .createSavedSnippetAndSync({ title: "Bug report", content: "Current draft body" });

    expect(createSavedSnippetMock).toHaveBeenCalledWith({
      title: "Bug report",
      content: "Current draft body",
    });
    expect(useComposerSavedSnippetsStore.getState().snippets[0]?.title).toBe("Bug report");

    await Promise.resolve();
    await Promise.resolve();
    expect(fetchSavedSnippetsMock).toHaveBeenCalledTimes(2);
  });
});
