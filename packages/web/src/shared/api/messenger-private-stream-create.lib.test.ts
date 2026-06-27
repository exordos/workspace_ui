import { describe, expect, it } from "vitest";
import {
  buildAddStreamUsersBody,
  buildCreatePrivateMessageStreamBody,
  parseCreatedWorkspaceStream,
  resolvePrivateMessageStreamName,
} from "./messenger-private-stream-create.lib";

const PEER_UUID = "00000000-0000-0000-0000-000000000002";
const MEMBER_UUID = "00000000-0000-0000-0000-000000000003";
const STREAM_UUID = "b4460c02-d693-4564-8804-98059613b86e";

describe("resolvePrivateMessageStreamName", () => {
  it("uses trimmed peer display name when present", () => {
    expect(resolvePrivateMessageStreamName("  Alice Smith  ", PEER_UUID)).toBe("Alice Smith");
  });

  it("falls back to peer uuid when display name is empty", () => {
    expect(resolvePrivateMessageStreamName("   ", PEER_UUID)).toBe(PEER_UUID);
  });
});

describe("buildCreatePrivateMessageStreamBody", () => {
  it("includes direct_user_uuid for backend-owned private bindings", () => {
    expect(
      buildCreatePrivateMessageStreamBody({
        peerUserUuid: PEER_UUID,
        peerDisplayName: "Alice Smith",
      }),
    ).toEqual({
      name: "Alice Smith",
      description: "",
      source_name: "native",
      source: { kind: "native" },
      direct_user_uuid: PEER_UUID,
    });
  });
});

describe("buildAddStreamUsersBody", () => {
  it("groups peer users by owner role", () => {
    expect(
      buildAddStreamUsersBody({
        userUuids: [PEER_UUID],
      }),
    ).toEqual({
      owner: [PEER_UUID],
    });
  });

  it("can group regular stream members without project_id or stream_uuid", () => {
    expect(
      buildAddStreamUsersBody({
        userUuids: [PEER_UUID, MEMBER_UUID, PEER_UUID.toUpperCase()],
        role: "member",
      }),
    ).toEqual({
      member: [PEER_UUID, MEMBER_UUID],
    });
  });
});

describe("parseCreatedWorkspaceStream", () => {
  it("reads stream uuid from uuid when stream_uuid is absent", () => {
    expect(
      parseCreatedWorkspaceStream({
        uuid: STREAM_UUID,
        name: "Alice Smith",
        private: true,
      }),
    ).toEqual({
      streamUuid: STREAM_UUID,
      name: "Alice Smith",
    });
  });

  it("prefers stream_uuid when both fields are present", () => {
    expect(
      parseCreatedWorkspaceStream({
        uuid: "11111111-1111-4111-8111-111111111111",
        stream_uuid: STREAM_UUID,
        name: "Alice Smith",
      }),
    ).toEqual({
      streamUuid: STREAM_UUID,
      name: "Alice Smith",
    });
  });

  it("reads owner uuid from stream response when present", () => {
    expect(
      parseCreatedWorkspaceStream({
        uuid: STREAM_UUID,
        name: "Engineering",
        user_uuid: PEER_UUID,
      }),
    ).toEqual({
      streamUuid: STREAM_UUID,
      name: "Engineering",
      ownerUserUuid: PEER_UUID,
    });
  });
});
