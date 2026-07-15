import { describe, expect, it, vi } from "vitest";
import {
  publishExternalAccountUpdated,
  subscribeExternalAccountUpdates,
} from "./external-account-realtime.lib";

describe("external account realtime notifications", () => {
  it("notifies active settings consumers and supports unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeExternalAccountUpdates(listener);

    publishExternalAccountUpdated({
      kind: "external_account.updated",
      account_type: "mail",
    });
    expect(listener).toHaveBeenCalledOnce();

    unsubscribe();
    publishExternalAccountUpdated({
      kind: "external_account.updated",
      account_type: "mail",
    });
    expect(listener).toHaveBeenCalledOnce();
  });
});
