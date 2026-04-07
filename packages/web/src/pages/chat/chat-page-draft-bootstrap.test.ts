import { describe, expect, it } from "vitest";
import type { Draft } from "~/entities/draft/draft.types";
import { resolveHydratedDraftBootstrap } from "./chat-page-draft-bootstrap";

const HYDRATED_DRAFT: Draft = {
  id: 42,
  type: "stream",
  to: [10],
  topic: "general",
  content: "Hydrated draft",
  timestamp: 1,
};

describe("resolveHydratedDraftBootstrap", () => {
  it("adopts a hydrated draft when the composer is still empty", () => {
    expect(resolveHydratedDraftBootstrap("", HYDRATED_DRAFT)).toEqual({
      initialValue: "Hydrated draft",
      activeDraftId: 42,
    });
  });

  it("does not overwrite newer user input with a hydrated draft", () => {
    expect(resolveHydratedDraftBootstrap("typed locally", HYDRATED_DRAFT)).toBeNull();
  });

  it("does nothing when no matching hydrated draft exists", () => {
    expect(resolveHydratedDraftBootstrap("", undefined)).toBeNull();
  });
});
