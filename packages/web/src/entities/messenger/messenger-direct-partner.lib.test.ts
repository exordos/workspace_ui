import { describe, expect, it } from "vitest";
import { resolveWorkspaceDirectPartnerUuid } from "./messenger-direct-partner.lib";

const CURRENT_USER_UUID = "11111111-1111-4111-8111-111111111111";
const PARTNER_USER_UUID = "22222222-2222-4222-8222-222222222222";
const THIRD_USER_UUID = "33333333-3333-4333-8333-333333333333";

describe("resolveWorkspaceDirectPartnerUuid", () => {
  it("returns the explicit direct user of a native direct stream", () => {
    const partnerUuid = resolveWorkspaceDirectPartnerUuid({
      source: { isPrivate: true, directUserUuid: PARTNER_USER_UUID },
      memberUserUuids: [],
      currentUserUuid: CURRENT_USER_UUID,
    });

    expect(partnerUuid).toBe(PARTNER_USER_UUID);
  });

  it("resolves the partner by exclusion when a private stream has exactly two members", () => {
    const partnerUuid = resolveWorkspaceDirectPartnerUuid({
      source: { isPrivate: true, directUserUuid: null },
      memberUserUuids: [CURRENT_USER_UUID, PARTNER_USER_UUID],
      currentUserUuid: CURRENT_USER_UUID,
    });

    expect(partnerUuid).toBe(PARTNER_USER_UUID);
  });

  it("ignores duplicated bindings of the same two members", () => {
    const partnerUuid = resolveWorkspaceDirectPartnerUuid({
      source: { isPrivate: true, directUserUuid: null },
      memberUserUuids: [PARTNER_USER_UUID, CURRENT_USER_UUID, PARTNER_USER_UUID],
      currentUserUuid: CURRENT_USER_UUID,
    });

    expect(partnerUuid).toBe(PARTNER_USER_UUID);
  });

  it("keeps a public stream as a channel even with two members", () => {
    const partnerUuid = resolveWorkspaceDirectPartnerUuid({
      source: { isPrivate: false, directUserUuid: null },
      memberUserUuids: [CURRENT_USER_UUID, PARTNER_USER_UUID],
      currentUserUuid: CURRENT_USER_UUID,
    });

    expect(partnerUuid).toBeNull();
  });

  it("keeps a private stream with three members as a channel", () => {
    const partnerUuid = resolveWorkspaceDirectPartnerUuid({
      source: { isPrivate: true, directUserUuid: null },
      memberUserUuids: [CURRENT_USER_UUID, PARTNER_USER_UUID, THIRD_USER_UUID],
      currentUserUuid: CURRENT_USER_UUID,
    });

    expect(partnerUuid).toBeNull();
  });

  it("keeps a private stream as a channel when the current user is not a member", () => {
    const partnerUuid = resolveWorkspaceDirectPartnerUuid({
      source: { isPrivate: true, directUserUuid: null },
      memberUserUuids: [PARTNER_USER_UUID, THIRD_USER_UUID],
      currentUserUuid: CURRENT_USER_UUID,
    });

    expect(partnerUuid).toBeNull();
  });

  it("keeps a private stream as a channel while bindings are not loaded yet", () => {
    const partnerUuid = resolveWorkspaceDirectPartnerUuid({
      source: { isPrivate: true, directUserUuid: null },
      memberUserUuids: [],
      currentUserUuid: CURRENT_USER_UUID,
    });

    expect(partnerUuid).toBeNull();
  });

  it("returns null without a signed-in user and without an explicit direct user", () => {
    const partnerUuid = resolveWorkspaceDirectPartnerUuid({
      source: { isPrivate: true, directUserUuid: null },
      memberUserUuids: [CURRENT_USER_UUID, PARTNER_USER_UUID],
      currentUserUuid: null,
    });

    expect(partnerUuid).toBeNull();
  });

  it("returns null without a conversation source", () => {
    const partnerUuid = resolveWorkspaceDirectPartnerUuid({
      source: null,
      memberUserUuids: [CURRENT_USER_UUID, PARTNER_USER_UUID],
      currentUserUuid: CURRENT_USER_UUID,
    });

    expect(partnerUuid).toBeNull();
  });
});
