import { describe, expect, it } from "vitest";
import {
  buildMoveTopicTargetStreamOptions,
  resolveMoveTopicTargetName,
  resolveSelectedTargetStreamId,
} from "./move-topic-to-stream.lib";

describe("move-topic-to-stream.lib", () => {
  const SOURCE_STREAM_UUID = "00000000-0000-4000-8000-000000000010";
  const TARGET_STREAM_UUID = "00000000-0000-4000-8000-000000000020";

  it("buildMoveTopicTargetStreamOptions excludes source stream", () => {
    expect(
      buildMoveTopicTargetStreamOptions(
        [
          { streamId: SOURCE_STREAM_UUID, name: "general" },
          { streamId: TARGET_STREAM_UUID, name: "dev" },
        ],
        SOURCE_STREAM_UUID,
      ),
    ).toEqual([{ streamId: TARGET_STREAM_UUID, name: "dev" }]);
  });

  it("resolveMoveTopicTargetName preserves resolved checkmark", () => {
    expect(resolveMoveTopicTargetName("\u2714 incident", "postmortem")).toBe("\u2714 postmortem");
  });

  it("resolveSelectedTargetStreamId returns id only for valid option", () => {
    const options = [{ streamId: TARGET_STREAM_UUID, name: "dev" }];
    expect(resolveSelectedTargetStreamId(TARGET_STREAM_UUID, options)).toBe(TARGET_STREAM_UUID);
    expect(resolveSelectedTargetStreamId("99", options)).toBeNull();
  });
});
