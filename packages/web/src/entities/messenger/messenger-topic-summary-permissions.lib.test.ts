import { describe, expect, it } from "vitest";
import {
  TOPIC_SUMMARY_ENDPOINT_MANAGE_PERMISSION,
  TOPIC_SUMMARY_SETTINGS_MANAGE_PERMISSION,
  resolveMessengerTopicSummaryPermissions,
} from "./messenger-topic-summary-permissions.lib";
import type { MessengerStream } from "./messenger.types";

const CURRENT_USER_UUID = "11111111-1111-4111-8111-111111111111";

function stream(overrides: Partial<MessengerStream> = {}): MessengerStream {
  return {
    uuid: "22222222-2222-4222-8222-222222222222",
    projectId: "33333333-3333-4333-8333-333333333333",
    ownerUuid: "44444444-4444-4444-8444-444444444444",
    userUuid: CURRENT_USER_UUID,
    role: "member",
    notificationMode: "all_messages",
    name: "Roadmap",
    description: "",
    unreadCount: 0,
    sourceName: "native",
    source: { kind: "native" },
    audience: "channel",
    isPrivate: false,
    inviteOnly: false,
    announce: false,
    isArchived: false,
    directUserUuid: null,
    lastMessageUuid: null,
    createdAt: "2026-08-21T10:00:00Z",
    updatedAt: "2026-08-21T10:00:00Z",
    ...overrides,
  };
}

describe("resolveMessengerTopicSummaryPermissions", () => {
  it("allows topic management for the current user's owner binding", () => {
    expect(
      resolveMessengerTopicSummaryPermissions({
        currentUserUuid: CURRENT_USER_UUID,
        stream: stream({ role: "owner" }),
      }),
    ).toEqual({
      topic: "allowed",
      gates: "unknown",
      endpoints: "unknown",
      isGearVisible: true,
    });
  });

  it("allows topic management for the current user's administrator binding", () => {
    expect(
      resolveMessengerTopicSummaryPermissions({
        currentUserUuid: CURRENT_USER_UUID,
        stream: stream({ role: "administrator" }),
        capabilities: [],
      }),
    ).toEqual({
      topic: "allowed",
      gates: "denied",
      endpoints: "denied",
      isGearVisible: true,
    });
  });

  it.each(["guest", "member", "moderator"] as const)(
    "denies topic management for a %s binding",
    (role) => {
      expect(
        resolveMessengerTopicSummaryPermissions({
          currentUserUuid: CURRENT_USER_UUID,
          stream: stream({ role }),
          capabilities: [],
        }),
      ).toEqual({
        topic: "denied",
        gates: "denied",
        endpoints: "denied",
        isGearVisible: false,
      });
    },
  );

  it("keeps topic permission unknown when identity or the user-scoped stream is missing", () => {
    expect(resolveMessengerTopicSummaryPermissions({ capabilities: [] })).toEqual({
      topic: "unknown",
      gates: "denied",
      endpoints: "denied",
      isGearVisible: false,
    });
    expect(
      resolveMessengerTopicSummaryPermissions({
        currentUserUuid: CURRENT_USER_UUID,
        stream: stream({
          userUuid: "55555555-5555-4555-8555-555555555555",
          role: "administrator",
        }),
        capabilities: [],
      }).topic,
    ).toBe("unknown");
  });

  it("does not infer topic permission from stream ownership metadata", () => {
    expect(
      resolveMessengerTopicSummaryPermissions({
        currentUserUuid: CURRENT_USER_UUID,
        stream: stream({ ownerUuid: CURRENT_USER_UUID, role: "member" }),
        capabilities: [],
      }),
    ).toEqual({
      topic: "denied",
      gates: "denied",
      endpoints: "denied",
      isGearVisible: false,
    });
  });

  it("keeps global permissions unknown until capabilities are available", () => {
    const permissions = resolveMessengerTopicSummaryPermissions({
      currentUserUuid: CURRENT_USER_UUID,
      stream: stream({ role: "administrator" }),
    });

    expect(permissions.gates).toBe("unknown");
    expect(permissions.endpoints).toBe("unknown");
    expect(permissions.isGearVisible).toBe(true);
  });

  it("hides settings for a member while IAM capabilities are unknown", () => {
    expect(
      resolveMessengerTopicSummaryPermissions({
        currentUserUuid: CURRENT_USER_UUID,
        stream: stream({ role: "member" }),
      }),
    ).toEqual({
      topic: "denied",
      gates: "unknown",
      endpoints: "unknown",
      isGearVisible: false,
    });
  });

  it("uses only the exact settings capability for gates", () => {
    expect(
      resolveMessengerTopicSummaryPermissions({
        capabilities: [TOPIC_SUMMARY_SETTINGS_MANAGE_PERMISSION],
      }),
    ).toEqual({
      topic: "unknown",
      gates: "allowed",
      endpoints: "denied",
      isGearVisible: true,
    });
  });

  it("uses only the exact endpoint capability for endpoint administration", () => {
    expect(
      resolveMessengerTopicSummaryPermissions({
        capabilities: [TOPIC_SUMMARY_ENDPOINT_MANAGE_PERMISSION],
      }),
    ).toEqual({
      topic: "unknown",
      gates: "denied",
      endpoints: "allowed",
      isGearVisible: true,
    });
  });

  it("does not accept wildcard or similarly named capabilities", () => {
    expect(
      resolveMessengerTopicSummaryPermissions({
        capabilities: [
          "workspace.topic_summary_settings.*",
          "workspace.topic_summary_endpoint.read",
        ],
      }),
    ).toEqual({
      topic: "unknown",
      gates: "denied",
      endpoints: "denied",
      isGearVisible: false,
    });
  });

  it("allows every section when both IAM capabilities and topic role are present", () => {
    expect(
      resolveMessengerTopicSummaryPermissions({
        currentUserUuid: CURRENT_USER_UUID,
        stream: stream({ role: "administrator" }),
        capabilities: [
          TOPIC_SUMMARY_SETTINGS_MANAGE_PERMISSION,
          TOPIC_SUMMARY_ENDPOINT_MANAGE_PERMISSION,
        ],
      }),
    ).toEqual({
      topic: "allowed",
      gates: "allowed",
      endpoints: "allowed",
      isGearVisible: true,
    });
  });
});
