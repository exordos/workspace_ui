import { describe, expect, it } from "vitest";
import { parseProviderDeliveryMeta, requireProviderDeliveryMeta } from "./provider-delivery.lib";

describe("parseProviderDeliveryMeta", () => {
  it("parses the canonical nested projection", () => {
    expect(
      parseProviderDeliveryMeta({
        provider: { uuid: "provider-1", name: "Mailcow", kind: "mail" },
        delivery: {
          status: "failed",
          safe_error: "Mailbox is unavailable",
          updated_at: "2026-07-15T10:00:00Z",
        },
      }),
    ).toEqual({
      provider: { uuid: "provider-1", name: "Mailcow", kind: "mail" },
      delivery: {
        status: "failed",
        safeError: "Mailbox is unavailable",
        updatedAt: "2026-07-15T10:00:00Z",
      },
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
        provider: { uuid: "provider-1", name: "Mailcow", kind: "mail" },
        delivery: { status: "delivered" },
      }),
    ).toBeUndefined();
    expect(() => requireProviderDeliveryMeta({ provider: null })).toThrow(
      "Invalid provider delivery metadata",
    );
  });
});
