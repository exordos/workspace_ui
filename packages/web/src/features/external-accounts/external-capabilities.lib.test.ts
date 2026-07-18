import { describe, expect, it } from "vitest";
import { EXTERNAL_CAPABILITY, isExternalCapabilityAvailable } from "./external-capabilities.lib";

describe("external effective capabilities", () => {
  it("fails closed for absent and unavailable capability names", () => {
    expect(isExternalCapabilityAvailable({}, EXTERNAL_CAPABILITY.chatCatalog)).toBe(false);
    expect(
      isExternalCapabilityAvailable(
        {
          [EXTERNAL_CAPABILITY.chatCatalog]: {
            available: false,
            revision: 1,
            limits: {},
            unavailableReason: { code: "bridge_offline", message: "Bridge is offline" },
          },
        },
        EXTERNAL_CAPABILITY.chatCatalog,
      ),
    ).toBe(false);
  });

  it("accepts only an explicitly available canonical capability", () => {
    expect(
      isExternalCapabilityAvailable(
        {
          [EXTERNAL_CAPABILITY.chatCatalog]: {
            available: true,
            revision: 1,
            limits: {},
          },
        },
        EXTERNAL_CAPABILITY.chatCatalog,
      ),
    ).toBe(true);
  });
});
