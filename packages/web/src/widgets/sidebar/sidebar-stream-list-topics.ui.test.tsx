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
            stream_id: 10,
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

  it("renders default topic label for legacy general chat alias", () => {
    render(
      <MemoryRouter>
        <SidebarStreamListTopics
          stream={{
            type: "stream",
            stream_id: 10,
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

    expect(screen.getByText(t("chat.generalChat"))).toBeInTheDocument();
    expect(screen.queryByText("general chat")).not.toBeInTheDocument();
  });

  it("renders literal topic name when subject is non-empty", () => {
    render(
      <MemoryRouter>
        <SidebarStreamListTopics
          stream={{
            type: "stream",
            stream_id: 10,
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
});
