import { describe, expect, it, vi } from "vitest";
import { optimisticMutation } from "./optimistic-mutation.lib";

describe("optimisticMutation", () => {
  it("reconciles on success", async () => {
    const apply = vi.fn();
    const reconcile = vi.fn();
    const rollback = vi.fn();
    const result = await optimisticMutation({
      apply,
      request: () => Promise.resolve(true),
      reconcile,
      rollback,
    });
    expect(apply).toHaveBeenCalledOnce();
    expect(reconcile).toHaveBeenCalledWith(true);
    expect(rollback).not.toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it("rolls back on failure", async () => {
    const rollback = vi.fn();
    await optimisticMutation({
      apply: () => {},
      request: () => Promise.reject(new Error("fail")),
      reconcile: () => {},
      rollback,
    });
    expect(rollback).toHaveBeenCalledOnce();
  });

  it("rolls back on falsy when rollbackOnFalsy", async () => {
    const rollback = vi.fn();
    await optimisticMutation({
      apply: () => {},
      request: () => Promise.resolve(false),
      reconcile: () => {},
      rollback,
      rollbackOnFalsy: true,
    });
    expect(rollback).toHaveBeenCalledOnce();
  });
});
