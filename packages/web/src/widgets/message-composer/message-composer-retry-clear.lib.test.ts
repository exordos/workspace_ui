import { describe, expect, it } from "vitest";
import { removeRetriedComposerFiles } from "./message-composer-retry-clear.lib";

describe("removeRetriedComposerFiles", () => {
  it("removes only exact file objects from the retried attempt", () => {
    const retried = new File(["same"], "same.txt", { type: "text/plain" });
    const newlyAttachedCopy = new File(["same"], "same.txt", { type: "text/plain" });

    expect(removeRetriedComposerFiles([retried, newlyAttachedCopy], [retried])).toEqual([
      newlyAttachedCopy,
    ]);
  });
});
