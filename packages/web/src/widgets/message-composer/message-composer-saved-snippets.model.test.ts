import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  resetComposerSavedSnippetsModelForTests,
  useComposerSavedSnippetsStore,
} from "./message-composer-saved-snippets.model";

describe("message-composer-saved-snippets.model", () => {
  beforeEach(() => {
    resetComposerSavedSnippetsModelForTests();
  });

  afterEach(() => {
    resetComposerSavedSnippetsModelForTests();
  });

  it("opens as an empty unsupported list without loading", async () => {
    await useComposerSavedSnippetsStore.getState().openSavedSnippets();

    expect(useComposerSavedSnippetsStore.getState()).toMatchObject({
      snippets: [],
      loadingInitial: false,
      refreshing: false,
      error: null,
      hasLoadedOnce: true,
    });
  });

  it("refreshes as an empty unsupported list", async () => {
    await useComposerSavedSnippetsStore.getState().refreshSavedSnippets({ force: true });

    expect(useComposerSavedSnippetsStore.getState()).toMatchObject({
      snippets: [],
      loadingInitial: false,
      refreshing: false,
      error: null,
      hasLoadedOnce: true,
      requestVersion: 1,
    });
  });

  it("marks create as unsupported without adding an optimistic snippet", async () => {
    await useComposerSavedSnippetsStore
      .getState()
      .createSavedSnippetAndSync({ title: "Bug report", content: "Current draft body" });

    expect(useComposerSavedSnippetsStore.getState()).toMatchObject({
      snippets: [],
      loadingInitial: false,
      refreshing: false,
      error: "unsupported",
      hasLoadedOnce: true,
    });
  });
});
