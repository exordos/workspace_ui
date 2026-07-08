import { describe, expect, it } from "vitest";
import {
  buildWorkspaceJitsiMeetingUrl,
  buildWorkspaceJitsiRoomName,
} from "./workspace-jitsi-call.lib";

describe("Workspace Jitsi call helpers", () => {
  it("builds Workspace-scoped room names without Zulip identifiers", () => {
    expect(
      buildWorkspaceJitsiRoomName({
        organizationId: "org-a",
        projectId: "project-a",
        streamUuid: "75309057-419c-4b12-a7c1-3932429ec4a6",
        topicUuid: "4ec0b996-b778-45f8-8ef4-ef863be0c047",
        nowMs: 123,
      }),
    ).toBe(
      "workspace-org-a-project-a-75309057-419c-4b12-a7c1-3932429ec4a6-4ec0b996-b778-45f8-8ef4-ef863be0c047-123",
    );
  });

  it("builds meeting URLs from Workspace server settings", () => {
    expect(
      buildWorkspaceJitsiMeetingUrl({
        meetUrl: "https://meet.workspace.example.com",
        organizationId: "org-a",
        projectId: "project-a",
        streamUuid: "stream-a",
        topicUuid: "topic-a",
        nowMs: 123,
      }),
    ).toBe("https://meet.workspace.example.com/workspace-org-a-project-a-stream-a-topic-a-123");
  });
});
