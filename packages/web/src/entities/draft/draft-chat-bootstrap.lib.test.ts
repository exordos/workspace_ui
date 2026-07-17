import { describe, expect, it } from "vitest";
import { createDraftFixture } from "~/test/factories";
import { resolveHydratedDraftBootstrap } from "./draft-chat-bootstrap.lib";

const HYDRATED_DRAFT = createDraftFixture({
  uuid: "00000000-0000-4000-8000-000000000042",
  content: "Hydrated draft",
});

describe("resolveHydratedDraftBootstrap", () => {
  it("adopts a hydrated draft when the composer is still empty", () => {
    expect(resolveHydratedDraftBootstrap("", HYDRATED_DRAFT)).toEqual({
      initialValue: "Hydrated draft",
      activeDraftId: HYDRATED_DRAFT.uuid,
    });
  });

  it("does not overwrite newer user input with a hydrated draft", () => {
    expect(resolveHydratedDraftBootstrap("typed locally", HYDRATED_DRAFT)).toBeNull();
  });

  it("does nothing when no matching hydrated draft exists", () => {
    expect(resolveHydratedDraftBootstrap("", undefined)).toBeNull();
  });
});
