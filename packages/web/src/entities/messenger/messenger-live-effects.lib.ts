import type { WorkspaceMessengerProviderDto } from "~/shared/api/messenger.types";

export type MessengerMessageLiveEffectPolicyReason =
  | "native"
  | "provider_gate_closed"
  | "backfill"
  | "live"
  | "legacy_provider";

export interface MessengerMessageLiveEffectPolicy {
  notificationEligible: boolean;
  liveSideEffectsEligible: boolean;
  reason: MessengerMessageLiveEffectPolicyReason;
}

export function resolveMessengerMessageLiveEffectPolicy(message: {
  provider?: WorkspaceMessengerProviderDto | null;
}): MessengerMessageLiveEffectPolicy {
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
