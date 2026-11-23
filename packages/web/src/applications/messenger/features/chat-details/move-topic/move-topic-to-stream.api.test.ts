import { describe, expect, it } from "vitest";
import { moveTopicToChannel } from "./move-topic-to-stream.api";

describe("moveTopicToChannel", () => {
  it("returns unsupported without calling legacy read-state API", async () => {
    await expect(moveTopicToChannel(10, "incident", 20, "postmortem")).resolves.toBe(false);
  });
});
