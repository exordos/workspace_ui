import { describe, expect, it } from "vitest";
import type { WorkspaceMessengerProviderDto } from "~/shared/api/messenger.types";
import { resolveMessengerMessageLiveEffectPolicy } from "./messenger-live-effects.lib";

const BASE_PROVIDER: WorkspaceMessengerProviderDto = {
  kind: "zulip",
  account_uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  external_id: "message-42",
  capabilities: {},
};

describe("messenger live effect policy", () => {
  it("keeps native and legacy provider messages on the existing policy", () => {
    expect(resolveMessengerMessageLiveEffectPolicy({ provider: null })).toEqual({
      notificationEligible: true,
      liveSideEffectsEligible: true,
      reason: "native",
    });
    expect(resolveMessengerMessageLiveEffectPolicy({ provider: BASE_PROVIDER })).toEqual({
      notificationEligible: true,
      liveSideEffectsEligible: true,
      reason: "legacy_provider",
    });
  });

  it("blocks backfill even when provider metadata contradicts the delivery class", () => {
    expect(
      resolveMessengerMessageLiveEffectPolicy({
        provider: {
          ...BASE_PROVIDER,
          delivery_class: "backfill",
          notification_eligible: true,
        },
      }),
    ).toEqual({
      notificationEligible: false,
      liveSideEffectsEligible: false,
      reason: "backfill",
    });
  });

  it("uses the frozen provider gate for live messages", () => {
    expect(
      resolveMessengerMessageLiveEffectPolicy({
        provider: {
          ...BASE_PROVIDER,
          notification_eligible: false,
        },
      }),
    ).toEqual({
      notificationEligible: false,
      liveSideEffectsEligible: false,
      reason: "provider_gate_closed",
    });
    expect(
      resolveMessengerMessageLiveEffectPolicy({
        provider: {
          ...BASE_PROVIDER,
          delivery_class: "live",
          notification_eligible: false,
        },
      }),
    ).toEqual({
      notificationEligible: false,
      liveSideEffectsEligible: false,
      reason: "provider_gate_closed",
    });
    expect(
      resolveMessengerMessageLiveEffectPolicy({
        provider: {
          ...BASE_PROVIDER,
          delivery_class: "live",
          notification_eligible: true,
        },
      }),
    ).toEqual({
      notificationEligible: true,
      liveSideEffectsEligible: true,
      reason: "live",
    });
  });
});
