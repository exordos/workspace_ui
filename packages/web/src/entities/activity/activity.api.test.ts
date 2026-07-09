import { describe, expect, it } from "vitest";
import { loadLegacyActivityEmptyPage } from "./activity.api";

describe("loadLegacyActivityEmptyPage", () => {
  it("returns an empty complete page without a server request", async () => {
    await expect(loadLegacyActivityEmptyPage("mentions", 7)).resolves.toEqual({
      messages: [],
      foundOldest: true,
    });
  });

  it("keeps abort behavior explicit", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      loadLegacyActivityEmptyPage("reactions", 7, "newest", 200, {
        signal: controller.signal,
      }),
    ).rejects.toThrow("Aborted");
  });
});
