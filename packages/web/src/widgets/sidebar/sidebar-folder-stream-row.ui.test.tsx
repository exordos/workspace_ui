import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { t } from "~/i18n/i18n";
import { SidebarFolderStreamRow } from "./sidebar-folder-stream-row.ui";

describe("SidebarFolderStreamRow", () => {
  it("emphasizes an unread topic inside a custom folder", () => {
    const streamUuid = "00000000-0000-4000-8000-000000000010";
    const onToggleStream = vi.fn();
    render(
      <MemoryRouter>
        <SidebarFolderStreamRow
          chat={{
            type: "stream",
            streamUuid,
            name: "Engineering",
            lastMessage: "New incident",
            time: "",
            topics: [{ subject: "incident", badge: 2, lastMessage: "New incident" }],
          }}
          isPinnedChat={false}
          isCompactDensity={true}
          canExpandStreams
          expandedStreamSlugs={[streamUuid]}
          activeStreamSlug={null}
          activeTopic={null}
          onToggleStream={onToggleStream}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("incident").parentElement).toHaveClass("font-semibold");
  });

  it("marks folder stream rows imported from an external messenger", () => {
    render(
      <MemoryRouter>
        <SidebarFolderStreamRow
          chat={{
            type: "stream",
            streamUuid: "00000000-0000-4000-8000-000000000010",
            name: "Engineering",
            sourceName: "zulip",
            lastMessage: "",
            time: "",
            topics: [],
          }}
          isPinnedChat={false}
          isCompactDensity={true}
          canExpandStreams={false}
          expandedStreamSlugs={[]}
          activeStreamSlug={null}
          activeTopic={null}
          onToggleStream={undefined}
        />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText(t("source.externalFrom", { source: "Zulip" }))).toHaveTextContent(
      "Zulip",
    );
  });
});
