import { describe, expect, it, vi } from "vitest";
import { closeReadMessageNotifications } from "./layout-notification-tags.lib";

describe("closeReadMessageNotifications", () => {
  it("closes message notifications for each read message id", () => {
    const closeByTag = vi.fn();

    closeReadMessageNotifications(closeByTag, [101, 202, 303]);

    expect(closeByTag).toHaveBeenCalledTimes(3);
    expect(closeByTag).toHaveBeenNthCalledWith(1, "msg-101");
    expect(closeByTag).toHaveBeenNthCalledWith(2, "msg-202");
    expect(closeByTag).toHaveBeenNthCalledWith(3, "msg-303");
  });

  it("deduplicates IDs and ignores invalid values", () => {
    const closeByTag = vi.fn();

    closeReadMessageNotifications(closeByTag, [101, 101, 0, -1, Number.NaN]);

    expect(closeByTag).toHaveBeenCalledTimes(1);
    expect(closeByTag).toHaveBeenCalledWith("msg-101");
  });
});
