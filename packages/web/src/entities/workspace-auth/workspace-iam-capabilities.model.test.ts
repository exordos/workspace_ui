import { beforeEach, describe, expect, it } from "vitest";
import { useWorkspaceIamCapabilitiesStore } from "./workspace-iam-capabilities.model";

describe("Workspace IAM capabilities store", () => {
  beforeEach(() => useWorkspaceIamCapabilitiesStore.getState().clear());

  it("clears permissions on owner change and rejects stale owner writes", () => {
    const store = useWorkspaceIamCapabilitiesStore.getState();
    const firstRequest = store.startLoad("owner-a", 1);
    expect(store.finishLoad("owner-a", 1, firstRequest, ["permission-a"], 100)).toBe(true);

    const secondRequest = store.startLoad("owner-b", 2);

    expect(useWorkspaceIamCapabilitiesStore.getState().permissions).toBeNull();
    expect(store.finishLoad("owner-a", 1, firstRequest, ["stale"])).toBe(false);
    expect(store.finishLoad("owner-b", 2, secondRequest, [], 200)).toBe(true);
    expect(useWorkspaceIamCapabilitiesStore.getState()).toMatchObject({
      ownerKey: "owner-b",
      permissions: [],
      status: "ready",
      lastLoadedAtMs: 200,
    });
  });

  it("keeps permissions while revalidating and clears them after a failed request", () => {
    const store = useWorkspaceIamCapabilitiesStore.getState();
    const firstRequest = store.startLoad("owner-a", 1);
    store.finishLoad("owner-a", 1, firstRequest, ["permission-a"], 100);

    const refreshRequest = store.startLoad("owner-a", 2);
    expect(useWorkspaceIamCapabilitiesStore.getState()).toMatchObject({
      permissions: ["permission-a"],
      status: "loading",
      lastLoadedAtMs: 100,
    });

    store.failLoad("owner-a", 2, refreshRequest, "network failure");

    expect(useWorkspaceIamCapabilitiesStore.getState()).toMatchObject({
      ownerKey: "owner-a",
      runtimeGeneration: 2,
      permissions: null,
      status: "error",
      error: "network failure",
      lastLoadedAtMs: null,
    });
  });

  it("does not apply an older parallel request for the same owner", () => {
    const store = useWorkspaceIamCapabilitiesStore.getState();
    const firstRequest = store.startLoad("owner-a", 1);
    const secondRequest = store.startLoad("owner-a", 1);

    expect(store.finishLoad("owner-a", 1, firstRequest, ["stale"])).toBe(false);
    expect(store.finishLoad("owner-a", 1, secondRequest, ["current"])).toBe(true);
    expect(useWorkspaceIamCapabilitiesStore.getState().permissions).toEqual(["current"]);
  });

  it("invalidates only the active owner", () => {
    const store = useWorkspaceIamCapabilitiesStore.getState();
    store.startLoad("owner-a", 1);

    expect(store.invalidate("owner-b")).toBe(false);
    expect(store.invalidate("owner-a")).toBe(true);
    expect(useWorkspaceIamCapabilitiesStore.getState().invalidationVersion).toBe(1);
  });
});
