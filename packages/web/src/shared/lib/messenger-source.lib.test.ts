import { describe, expect, it } from "vitest";
import { getExternalMessageSourceName } from "./messenger-source.lib";

describe("getExternalMessageSourceName", () => {
  it("requires both the external source name and its message id", () => {
    expect(getExternalMessageSourceName("zulip", { kind: "zulip", message_id: 42 })).toBe("zulip");
    expect(
      getExternalMessageSourceName("zulip", { kind: "zulip", message_id: null }),
    ).toBeUndefined();
    expect(
      getExternalMessageSourceName(undefined, { kind: "zulip", message_id: 42 }),
    ).toBeUndefined();
    expect(
      getExternalMessageSourceName("native", { kind: "native", message_id: 42 }),
    ).toBeUndefined();
  });
});
