import type { WorkspaceMessengerProviderDto } from "~/shared/api/messenger.types";

export type MessengerMessageLiveEffectPolicyReason =
  | "native"
  | "provider_gate_closed"
  | "backfill"
  | "provider_message_too_old"
  | "live"
  | "legacy_provider";

const PROVIDER_MESSAGE_MAX_LIVE_EFFECT_AGE_MS = 60 * 60 * 1000;

export interface MessengerMessageLiveEffectPolicy {
  notificationEligible: boolean;
  liveSideEffectsEligible: boolean;
  reason: MessengerMessageLiveEffectPolicyReason;
}

export function resolveMessengerMessageLiveEffectPolicy(
  message: {
    provider?: WorkspaceMessengerProviderDto | null;
    createdAt: string;
  },
  now = Date.now(),
): MessengerMessageLiveEffectPolicy {
  const provider = message.provider;
  if (provider == null) {
    return {
      notificationEligible: true,
      liveSideEffectsEligible: true,
      reason: "native",
    };
  }

  if (provider.notification_eligible === false) {
    return {
      notificationEligible: false,
      liveSideEffectsEligible: false,
      reason: "provider_gate_closed",
    };
  }

  if (provider.delivery_class === "backfill") {
    return {
      notificationEligible: false,
      liveSideEffectsEligible: false,
      reason: "backfill",
    };
  }

  const createdAt = Date.parse(message.createdAt);
  if (Number.isFinite(createdAt) && now - createdAt > PROVIDER_MESSAGE_MAX_LIVE_EFFECT_AGE_MS) {
    return {
      notificationEligible: false,
      liveSideEffectsEligible: false,
      reason: "provider_message_too_old",
    };
  }

  if (provider.delivery_class === "live") {
    return {
      notificationEligible: true,
      liveSideEffectsEligible: true,
      reason: "live",
    };
  }

  return {
    notificationEligible: true,
    liveSideEffectsEligible: true,
    reason: "legacy_provider",
  };
}
