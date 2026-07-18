import { describe, expect, it } from "vitest";
import { parseProviderDeliveryMeta, requireProviderDeliveryMeta } from "./provider-delivery.lib";

describe("parseProviderDeliveryMeta", () => {
  it("parses the canonical nested projection", () => {
    expect(
      parseProviderDeliveryMeta({
        provider: {
          kind: "zulip",
          account_uuid: "account-1",
          external_id: "42",
          capabilities: {},
          delivery_class: "backfill",
          notification_eligible: false,
        },
        delivery: {
          external_operation_uuid: "operation-1",
          status: "failed",
          safe_error: "Mailbox is unavailable",
          can_retry: true,
          can_discard: true,
          updated_at: "2026-07-15T10:00:00Z",
          duplicate_risk: false,
          retry_requires_confirmation: false,
          original_url: null,
          reconciliation_reason: null,
        },
      }),
    ).toEqual({
      provider: {
        kind: "zulip",
        accountUuid: "account-1",
        externalId: "42",
        capabilities: {},
        deliveryClass: "backfill",
        notificationEligible: false,
      },
      delivery: {
        externalOperationUuid: "operation-1",
        status: "failed",
        safeError: "Mailbox is unavailable",
        canRetry: true,
        canDiscard: true,
        updatedAt: "2026-07-15T10:00:00Z",
        duplicateRisk: false,
        retryRequiresConfirmation: false,
        originalUrl: null,
        reconciliationReason: null,
      },
    });
  });

  it("parses manual reconciliation metadata and its original link", () => {
    expect(
      parseProviderDeliveryMeta({
        provider: {
          kind: "zulip",
          account_uuid: "account-1",
          external_id: null,
          capabilities: {
            "messenger.message.send": { available: true, revision: 1, limits: {} },
          },
        },
        delivery: {
          external_operation_uuid: "operation-2",
          status: "manual_reconciliation_required",
          safe_error: "Delivery could not be confirmed",
          can_retry: true,
          can_discard: true,
          updated_at: "2026-07-15T10:00:00Z",
          duplicate_risk: true,
          retry_requires_confirmation: true,
          original_url: "https://zulip.example/#narrow/id/42",
          reconciliation_reason: "provider_history_unavailable",
        },
      }),
    ).toEqual({
      provider: {
        kind: "zulip",
        accountUuid: "account-1",
        externalId: null,
        capabilities: {
          "messenger.message.send": {
            available: true,
            revision: 1,
            limits: {},
            unavailableReason: null,
          },
        },
      },
      delivery: {
        externalOperationUuid: "operation-2",
        status: "manual_reconciliation_required",
        safeError: "Delivery could not be confirmed",
        canRetry: true,
        canDiscard: true,
        updatedAt: "2026-07-15T10:00:00Z",
        duplicateRisk: true,
        retryRequiresConfirmation: true,
        originalUrl: "https://zulip.example/#narrow/id/42",
        reconciliationReason: "provider_history_unavailable",
      },
    });
  });

  it("keeps provider capabilities when delivery updated_at is null", () => {
    expect(
      parseProviderDeliveryMeta({
        provider: {
          kind: "zulip",
          account_uuid: "account-1",
          external_id: "42",
          capabilities: {
            "messenger.reaction.write": { available: true, revision: 1, limits: {} },
          },
        },
        delivery: {
          external_operation_uuid: "operation-3",
          status: "pending",
          safe_error: null,
          can_retry: false,
          can_discard: false,
          updated_at: null,
          duplicate_risk: false,
          retry_requires_confirmation: false,
          original_url: null,
          reconciliation_reason: null,
        },
      }),
    ).toEqual({
      provider: {
        kind: "zulip",
        accountUuid: "account-1",
        externalId: "42",
        capabilities: {
          "messenger.reaction.write": {
            available: true,
            revision: 1,
            limits: {},
            unavailableReason: null,
          },
        },
      },
      delivery: {
        externalOperationUuid: "operation-3",
        status: "pending",
        safeError: null,
        canRetry: false,
        canDiscard: false,
        updatedAt: null,
        duplicateRisk: false,
        retryRequiresConfirmation: false,
        originalUrl: null,
        reconciliationReason: null,
      },
    });
  });

  it("accepts a provider-neutral namespaced kind with the canonical envelope", () => {
    expect(
      parseProviderDeliveryMeta({
        provider: {
          kind: "calendar.caldav",
          account_uuid: "account-2",
          external_id: "event-42",
          capabilities: {},
        },
        delivery: null,
      }),
    ).toEqual({
      provider: {
        kind: "calendar.caldav",
        accountUuid: "account-2",
        externalId: "event-42",
        capabilities: {},
      },
      delivery: null,
    });
  });

  it("accepts explicit nulls for native entities", () => {
    expect(parseProviderDeliveryMeta({ provider: null, delivery: null })).toEqual({
      provider: null,
      delivery: null,
    });
  });

  it("rejects missing, flat, or incomplete metadata", () => {
    expect(parseProviderDeliveryMeta({ provider_uuid: "provider-1" })).toBeUndefined();
    expect(
      parseProviderDeliveryMeta({
        provider: { kind: "zulip", account_uuid: "account-1" },
        delivery: { status: "delivered" },
      }),
    ).toBeUndefined();
    expect(
      parseProviderDeliveryMeta({
        provider: {
          kind: "   ",
          account_uuid: "account-1",
          external_id: null,
          capabilities: {},
        },
        delivery: null,
      }),
    ).toBeUndefined();
    expect(
      parseProviderDeliveryMeta({
        provider: { uuid: "provider-1", name: "Legacy", kind: "calendar" },
        delivery: null,
      }),
    ).toBeUndefined();
    expect(() => requireProviderDeliveryMeta({ provider: null })).toThrow(
      "Invalid provider delivery metadata",
    );
    expect(
      parseProviderDeliveryMeta({
        provider: {
          kind: "zulip",
          account_uuid: "account-1",
          external_id: "42",
          capabilities: {},
          delivery_class: "replay",
          notification_eligible: false,
        },
        delivery: null,
      }),
    ).toBeUndefined();
    expect(
      parseProviderDeliveryMeta({
        provider: {
          kind: "zulip",
          account_uuid: "account-1",
          external_id: "42",
          capabilities: {},
          delivery_class: "live",
          notification_eligible: "yes",
        },
        delivery: null,
      }),
    ).toBeUndefined();
  });
});
