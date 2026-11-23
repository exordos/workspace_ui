import { describe, expect, it } from "vitest";
import type { WorkspaceMessengerProviderDto } from "~/shared/api/messenger.types";
import { resolveMessengerMessageLiveEffectPolicy } from "./messenger-live-effects.lib";

const BASE_PROVIDER: WorkspaceMessengerProviderDto = {
  kind: "zulip",
  account_uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  external_id: "message-42",
  capabilities: {},
};
const NOW = Date.parse("2026-08-25T12:00:00Z");
const RECENT_CREATED_AT = "2026-08-25T11:30:00Z";

describe("messenger live effect policy", () => {
  it("keeps native and legacy provider messages on the existing policy", () => {
    expect(
      resolveMessengerMessageLiveEffectPolicy(
        { provider: null, createdAt: RECENT_CREATED_AT },
        NOW,
      ),
    ).toEqual({
      notificationEligible: true,
      liveSideEffectsEligible: true,
      reason: "native",
    });
    expect(
      resolveMessengerMessageLiveEffectPolicy(
        { provider: BASE_PROVIDER, createdAt: RECENT_CREATED_AT },
        NOW,
      ),
    ).toEqual({
      notificationEligible: true,
      liveSideEffectsEligible: true,
      reason: "legacy_provider",
    });
  });

  it("blocks backfill even when provider metadata contradicts the delivery class", () => {
    expect(
      resolveMessengerMessageLiveEffectPolicy(
        {
          provider: {
            ...BASE_PROVIDER,
            delivery_class: "backfill",
            notification_eligible: true,
          },
          createdAt: RECENT_CREATED_AT,
        },
        NOW,
      ),
    ).toEqual({
      notificationEligible: false,
      liveSideEffectsEligible: false,
      reason: "backfill",
    });
  });

  it("uses the frozen provider gate for live messages", () => {
    expect(
      resolveMessengerMessageLiveEffectPolicy(
        {
          provider: {
            ...BASE_PROVIDER,
            notification_eligible: false,
          },
          createdAt: RECENT_CREATED_AT,
        },
        NOW,
      ),
    ).toEqual({
      notificationEligible: false,
      liveSideEffectsEligible: false,
      reason: "provider_gate_closed",
    });
    expect(
      resolveMessengerMessageLiveEffectPolicy(
        {
          provider: {
            ...BASE_PROVIDER,
            delivery_class: "live",
            notification_eligible: false,
          },
          createdAt: RECENT_CREATED_AT,
        },
        NOW,
      ),
    ).toEqual({
      notificationEligible: false,
      liveSideEffectsEligible: false,
      reason: "provider_gate_closed",
    });
    expect(
      resolveMessengerMessageLiveEffectPolicy(
        {
          provider: {
            ...BASE_PROVIDER,
            delivery_class: "live",
            notification_eligible: true,
          },
          createdAt: RECENT_CREATED_AT,
        },
        NOW,
      ),
    ).toEqual({
      notificationEligible: true,
      liveSideEffectsEligible: true,
      reason: "live",
    });
  });

  it("blocks provider messages older than one hour before allowing live or legacy delivery", () => {
    const tooOldCreatedAt = "2026-08-25T10:59:59.999Z";

    for (const provider of [
      { ...BASE_PROVIDER, delivery_class: "live" as const, notification_eligible: true },
      BASE_PROVIDER,
    ]) {
      expect(
        resolveMessengerMessageLiveEffectPolicy({ provider, createdAt: tooOldCreatedAt }, NOW),
      ).toEqual({
        notificationEligible: false,
        liveSideEffectsEligible: false,
        reason: "provider_message_too_old",
      });
    }
  });

  it("allows provider messages exactly one hour old and ignores age for native messages", () => {
    expect(
      resolveMessengerMessageLiveEffectPolicy(
        {
          provider: { ...BASE_PROVIDER, delivery_class: "live", notification_eligible: true },
          createdAt: "2026-08-25T11:00:00Z",
        },
        NOW,
      ),
    ).toEqual({
      notificationEligible: true,
      liveSideEffectsEligible: true,
      reason: "live",
    });
    expect(
      resolveMessengerMessageLiveEffectPolicy(
        { provider: null, createdAt: "2026-08-25T10:00:00Z" },
        NOW,
      ),
    ).toEqual({
      notificationEligible: true,
      liveSideEffectsEligible: true,
      reason: "native",
    });
  });

  it("keeps authoritative provider denials ahead of the age limit", () => {
    expect(
      resolveMessengerMessageLiveEffectPolicy(
        {
          provider: { ...BASE_PROVIDER, notification_eligible: false },
          createdAt: "2026-08-25T10:00:00Z",
        },
        NOW,
      ),
    ).toEqual({
      notificationEligible: false,
      liveSideEffectsEligible: false,
      reason: "provider_gate_closed",
    });
    expect(
      resolveMessengerMessageLiveEffectPolicy(
        {
          provider: {
            ...BASE_PROVIDER,
            delivery_class: "backfill",
            notification_eligible: true,
          },
          createdAt: "2026-08-25T10:00:00Z",
        },
        NOW,
      ),
    ).toEqual({
      notificationEligible: false,
      liveSideEffectsEligible: false,
      reason: "backfill",
    });
  });
});
