import { describe, expect, it } from "vitest";
import {
  buildMoveTopicTargetStreamOptions,
  resolveMoveTopicTargetName,
  resolveSelectedTargetStreamId,
} from "./move-topic-to-stream.lib";

describe("move-topic-to-stream.lib", () => {
  it("buildMoveTopicTargetStreamOptions excludes source stream", () => {
    expect(
      buildMoveTopicTargetStreamOptions(
        [
          { streamId: 10, name: "general" },
          { streamId: 20, name: "dev" },
        ],
        10,
      ),
    ).toEqual([{ streamId: 20, name: "dev" }]);
  });

  it("resolveMoveTopicTargetName preserves resolved checkmark", () => {
    expect(resolveMoveTopicTargetName("\u2714 incident", "postmortem")).toBe("\u2714 postmortem");
  });

  it("resolveSelectedTargetStreamId returns id only for valid option", () => {
    const options = [{ streamId: 20, name: "dev" }];
    expect(resolveSelectedTargetStreamId("20", options)).toBe(20);
    expect(resolveSelectedTargetStreamId("99", options)).toBeNull();
  });
});
