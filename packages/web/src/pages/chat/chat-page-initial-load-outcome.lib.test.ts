import { beforeEach, describe, expect, it } from "vitest";
import { useCurrentChatMessagesStore } from "~/entities/message/message.model";
import type { MockMessage } from "~/shared/api/zulip.types";
import { createMessage } from "~/test/factories";
import { resolveMessagesLoadErrorAfterInitialLoad } from "./chat-page-initial-load-outcome.lib";

describe("resolveMessagesLoadErrorAfterInitialLoad", () => {
  beforeEach(() => {
    useCurrentChatMessagesStore.setState({
      initialLoadError: null,
      messages: [],
    });
  });

  it("returns null when store has no initial load error", () => {
    expect(resolveMessagesLoadErrorAfterInitialLoad(false)).toBeNull();
  });

  it("returns initial when API failed on cold start", () => {
    useCurrentChatMessagesStore.setState({ initialLoadError: "Network error" });
    expect(resolveMessagesLoadErrorAfterInitialLoad(false)).toBe("initial");
  });

  it("returns refresh when cache was hydrated before API failure", () => {
    useCurrentChatMessagesStore.setState({
      initialLoadError: "Network error",
      messages: [createMessage({ id: 1 }) as MockMessage],
    });
    expect(resolveMessagesLoadErrorAfterInitialLoad(true)).toBe("refresh");
  });
});
