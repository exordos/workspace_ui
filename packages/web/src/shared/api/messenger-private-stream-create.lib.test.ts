import { describe, expect, it } from "vitest";
import {
  buildCreatePrivateMessageStreamBody,
  buildCreateStreamBindingBody,
  parseCreatedWorkspaceStream,
  resolvePrivateMessageStreamName,
} from "./messenger-private-stream-create.lib";

const PEER_UUID = "00000000-0000-0000-0000-000000000002";
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
  it("includes required WorkspaceStream fields without user_uuid", () => {
    expect(
      buildCreatePrivateMessageStreamBody({
        peerUserUuid: PEER_UUID,
        peerDisplayName: "Alice Smith",
      }),
    ).toEqual({
      private: true,
      name: "Alice Smith",
      description: "",
      source_name: "native",
      source: { kind: "native" },
    });
  });
});

describe("buildCreateStreamBindingBody", () => {
  it("binds peer user as owner on the created stream", () => {
    expect(
      buildCreateStreamBindingBody({
        streamUuid: STREAM_UUID,
        peerUserUuid: PEER_UUID,
      }),
    ).toEqual({
      stream_uuid: STREAM_UUID,
      user_uuid: PEER_UUID,
      role: "owner",
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
});
