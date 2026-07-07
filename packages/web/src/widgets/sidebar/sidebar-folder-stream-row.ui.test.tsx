import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { t } from "~/i18n/i18n";
import { SidebarFolderStreamRow } from "./sidebar-folder-stream-row.ui";

describe("SidebarFolderStreamRow", () => {
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
