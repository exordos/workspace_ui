import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { t } from "~/i18n/i18n";
import { SidebarStreamListTopics } from "./sidebar-stream-list-topics.ui";

describe("SidebarStreamListTopics", () => {
  it("renders default topic label for empty subject", () => {
    render(
      <MemoryRouter>
        <SidebarStreamListTopics
          stream={{
            type: "stream",
            streamUuid: "00000000-0000-4000-8000-000000000010",
            name: "engineering",
            lastMessage: "",
            time: "",
            topics: [],
          }}
          streamSlug="10-engineering"
          topics={[{ subject: "", lastMessage: "", time: "" }]}
          topicsLoading={false}
          activeStreamSlug={null}
          activeTopic={null}
          isCompactDensity={true}
          onNewTopic={undefined}
          creatingTopicForSlug={null}
          newTopicName=""
          setCreatingTopicForSlug={() => {}}
          setNewTopicName={() => {}}
          newTopicInputRef={{ current: null }}
          onMuteError={() => {}}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText(t("chat.generalChat"))).toBeInTheDocument();
  });

  it("renders server-provided general chat names as literal topics", () => {
    render(
      <MemoryRouter>
        <SidebarStreamListTopics
          stream={{
            type: "stream",
            streamUuid: "00000000-0000-4000-8000-000000000010",
            name: "engineering",
            lastMessage: "",
            time: "",
            topics: [],
          }}
          streamSlug="10-engineering"
          topics={[{ subject: "general chat", lastMessage: "", time: "" }]}
          topicsLoading={false}
          activeStreamSlug={null}
          activeTopic={null}
          isCompactDensity={true}
          onNewTopic={undefined}
          creatingTopicForSlug={null}
          newTopicName=""
          setCreatingTopicForSlug={() => {}}
          setNewTopicName={() => {}}
          newTopicInputRef={{ current: null }}
          onMuteError={() => {}}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("general chat")).toBeInTheDocument();
  });

  it("renders literal topic name when subject is non-empty", () => {
    render(
      <MemoryRouter>
        <SidebarStreamListTopics
          stream={{
            type: "stream",
            streamUuid: "00000000-0000-4000-8000-000000000010",
            name: "engineering",
            lastMessage: "",
            time: "",
            topics: [],
          }}
          streamSlug="10-engineering"
          topics={[{ subject: "release", lastMessage: "Ship it", time: "12:00" }]}
          topicsLoading={false}
          activeStreamSlug={null}
          activeTopic={null}
          isCompactDensity={true}
          onNewTopic={undefined}
          creatingTopicForSlug={null}
          newTopicName=""
          setCreatingTopicForSlug={() => {}}
          setNewTopicName={() => {}}
          newTopicInputRef={{ current: null }}
          onMuteError={() => {}}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("release")).toBeInTheDocument();
    expect(screen.queryByText(t("chat.generalChat"))).not.toBeInTheDocument();
  });

  it("uses server topic color for the left topic bar", () => {
    render(
      <MemoryRouter>
        <SidebarStreamListTopics
          stream={{
            type: "stream",
            streamUuid: "00000000-0000-4000-8000-000000000010",
            name: "engineering",
            lastMessage: "",
            time: "",
            topics: [],
          }}
          streamSlug="10-engineering"
          topics={[{ subject: "release", lastMessage: "Ship it", time: "12:00", color: 0xabcdef }]}
          topicsLoading={false}
          activeStreamSlug={null}
          activeTopic={null}
          isCompactDensity={true}
          onNewTopic={undefined}
          creatingTopicForSlug={null}
          newTopicName=""
          setCreatingTopicForSlug={() => {}}
          setNewTopicName={() => {}}
          newTopicInputRef={{ current: null }}
          onMuteError={() => {}}
        />
      </MemoryRouter>,
    );

    const topicLink = screen.getByRole("link", { name: /release/i });
    expect(topicLink.parentElement).toHaveStyle({ borderLeftColor: "#abcdef" });
  });
});
