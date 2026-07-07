import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { t } from "~/i18n/i18n";
import { SidebarStreamList } from "./sidebar-stream-list.ui";

describe("SidebarStreamList", () => {
  it("fills the stream circle with the server stream color", () => {
    render(
      <MemoryRouter>
        <SidebarStreamList
          streamChats={[
            {
              type: "stream",
              streamUuid: "00000000-0000-4000-8000-000000000010",
              name: "Engineering",
              color: 0x123456,
              lastMessage: "",
              time: "",
              topics: [{ subject: "release", lastMessage: "", time: "" }],
            },
          ]}
          activeStreamSlug={null}
          activeTopic={null}
          expandedStreamSlugs={[]}
          onToggleStream={() => {}}
        />
      </MemoryRouter>,
    );

    const streamLink = screen.getByRole("link", { name: /engineering/i });
    const circle = streamLink.querySelector('span[aria-hidden="true"]');
    expect(circle).toHaveStyle({ backgroundColor: "#123456", borderColor: "#123456" });
  });

  it("marks streams imported from an external messenger", () => {
    render(
      <MemoryRouter>
        <SidebarStreamList
          streamChats={[
            {
              type: "stream",
              streamUuid: "00000000-0000-4000-8000-000000000010",
              name: "Engineering",
              sourceName: "zulip",
              lastMessage: "",
              time: "",
              topics: [],
            },
          ]}
          activeStreamSlug={null}
          activeTopic={null}
          expandedStreamSlugs={[]}
          onToggleStream={() => {}}
        />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText(t("source.externalFrom", { source: "Zulip" }))).toHaveTextContent(
      "Zulip",
    );
  });
});
