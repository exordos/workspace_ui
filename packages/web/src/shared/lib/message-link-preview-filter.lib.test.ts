import { describe, expect, it } from "vitest";
import type { MockMessage } from "~/shared/api/zulip.types";
import { filterMessageLinkPreviewsForMarkdown } from "./message-link-preview-filter.lib";

describe("filterMessageLinkPreviewsForMarkdown", () => {
  it("removes previews for URLs no longer in body", () => {
    const message: MockMessage = {
      id: 1,
      sender_id: 1,
      sender_full_name: "A",
      stream_id: 1,
      subject: "t",
      content: "https://stay.test only",
      timestamp: 1,
      link_previews: [
        { targetUrl: "https://stay.test", title: "Stay" },
        { targetUrl: "https://gone.test", title: "Gone" },
      ],
    };
    const filtered = filterMessageLinkPreviewsForMarkdown(message, "https://stay.test only");
    expect(filtered.link_previews?.map((p) => p.targetUrl)).toEqual(["https://stay.test"]);
  });
});
