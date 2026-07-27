import { describe, expect, it } from "vitest";
import {
  isWorkspaceExternalProviderHealthDto,
  isWorkspaceExternalProviderPolicyDto,
} from "./messenger-external-provider-admin.types";

const policyDto = {
  uuid: "33333333-3333-4333-8333-333333333333",
  created_at: "2026-07-24T08:00:00Z",
  updated_at: "2026-07-24T09:00:00Z",
  revision: 3,
  provider: "zulip",
  enabled: true,
  emergency_suspended: false,
  limits: {
    max_accounts: 50,
    max_selected_chats_per_account: 500,
    max_file_bytes: 104_857_600,
  },
  custom_ca_bundle: {
    uuid: "44444444-4444-4444-8444-444444444444",
    generation: 2,
    sha256: "a".repeat(64),
    certificate_count: 2,
  },
} as const;

const healthDto = {
  provider: "zulip",
  status: "healthy",
  account_counts: { live: 3, degraded: 1 },
  chat_counts: { available: 19, live: 41 },
  bridge_counts: { active: 1 },
  operation_counts: { pending: 2 },
  metrics: {
    queue_depth: 4,
    selected_chats: 41,
    synchronized_messages: 9_586,
    synchronized_users: 25,
  },
  updated_at: "2026-07-24T09:00:00Z",
} as const;

describe("external provider admin DTO guards", () => {
  it("accepts the exact Zulip policy and health contracts", () => {
    expect(isWorkspaceExternalProviderPolicyDto(policyDto)).toBe(true);
    expect(isWorkspaceExternalProviderHealthDto(healthDto)).toBe(true);
  });

  it("accepts a policy without a custom CA bundle", () => {
    expect(
      isWorkspaceExternalProviderPolicyDto({
        ...policyDto,
        custom_ca_bundle: null,
      }),
    ).toBe(true);
  });

  it("rejects unsupported providers and malformed policy fields", () => {
    expect(isWorkspaceExternalProviderPolicyDto({ ...policyDto, provider: "slack" })).toBe(false);
    expect(
      isWorkspaceExternalProviderPolicyDto({
        ...policyDto,
        limits: { ...policyDto.limits, max_accounts: -1 },
      }),
    ).toBe(false);
    expect(
      isWorkspaceExternalProviderPolicyDto({
        ...policyDto,
        custom_ca_bundle: {
          ...policyDto.custom_ca_bundle,
          sha256: "not-a-sha256",
        },
      }),
    ).toBe(false);
  });

  it("accepts unknown health fields and rejects non-numeric dynamic values", () => {
    expect(
      isWorkspaceExternalProviderHealthDto({
        ...healthDto,
        future_aggregate: { ready: 3 },
        metrics: { ...healthDto.metrics, future_metric: "metadata" },
      }),
    ).toBe(true);
    expect(
      isWorkspaceExternalProviderHealthDto({
        ...healthDto,
        account_counts: { live: "3" },
      }),
    ).toBe(false);
    expect(
      isWorkspaceExternalProviderHealthDto({
        ...healthDto,
        metrics: { ...healthDto.metrics, queue_depth: Number.NaN },
      }),
    ).toBe(false);
  });

  it("rejects unknown health statuses and missing aggregates", () => {
    const { bridge_counts: _bridgeCounts, ...withoutBridgeCounts } = healthDto;
    const { chat_counts: _chatCounts, ...withoutChatCounts } = healthDto;
    expect(
      isWorkspaceExternalProviderHealthDto({
        ...healthDto,
        status: "degraded",
      }),
    ).toBe(false);
    expect(isWorkspaceExternalProviderHealthDto(withoutBridgeCounts)).toBe(false);
    expect(isWorkspaceExternalProviderHealthDto(withoutChatCounts)).toBe(false);
  });
});
