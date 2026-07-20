import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";

const getDraftsPage = vi.hoisted(() => vi.fn());
const resumeWorkspaceComposerDraftSync = vi.hoisted(() => vi.fn());
const storeState = vi.hoisted(() => ({
  hydrateOwnerDrafts: vi.fn(),
  applyServerDrafts: vi.fn(),
}));

vi.mock("~/shared/api/messenger-drafts.api", () => ({ getDraftsPage }));
vi.mock("./composer-draft-sync.lib", () => ({ resumeWorkspaceComposerDraftSync }));
vi.mock("./composer-draft.model", () => ({
  useWorkspaceComposerDraftStore: { getState: () => storeState },
}));

import { loadWorkspaceComposerDrafts } from "./composer-draft-loader.lib";

const runtimeContext: WorkspaceRuntimeContext = {
  accountId: "account-a",
  instanceId: "instance-a",
  organizationId: "organization-a",
  organizationOrigin: "https://workspace.example.test",
  projectId: "00000000-0000-4000-8000-000000000001",
  userUuid: "00000000-0000-4000-8000-000000000002",
  accessToken: "token",
  runtimeGeneration: 1,
};

describe("workspace composer draft loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeState.hydrateOwnerDrafts.mockResolvedValue(undefined);
    getDraftsPage.mockResolvedValue({ items: [], nextPageMarker: null });
  });

  it("restores cache, loads the bootstrap page once, then resumes pending writes", async () => {
    await loadWorkspaceComposerDrafts({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
      resumePending: true,
    });

    expect(storeState.hydrateOwnerDrafts).toHaveBeenCalledTimes(1);
    expect(getDraftsPage).toHaveBeenCalledTimes(1);
    expect(storeState.applyServerDrafts).toHaveBeenCalledTimes(1);
    expect(resumeWorkspaceComposerDraftSync).toHaveBeenCalledWith({
      runtimeContext,
      getRuntimeContext: expect.any(Function),
    });
  });

  it("does not resume writes for an explicit Drafts page load", async () => {
    await loadWorkspaceComposerDrafts({
      runtimeContext,
      getRuntimeContext: () => runtimeContext,
    });

    expect(getDraftsPage).toHaveBeenCalledTimes(1);
    expect(resumeWorkspaceComposerDraftSync).not.toHaveBeenCalled();
  });
});
