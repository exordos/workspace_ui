/**
 * TDD test templates — reference patterns for each code category.
 *
 * NOT executed at runtime. This file serves as documentation and a
 * copy-paste source for AI agents and developers following TDD.
 *
 * TDD Cycle: RED → GREEN → REFACTOR
 * 1. RED:      Write a failing test that describes the desired behavior
 * 2. GREEN:    Write the minimum code to make the test pass
 * 3. REFACTOR: Clean up while keeping tests green
 */

// ============================================================
// TEMPLATE 1: Pure function (shared/lib/)
// ============================================================
/*
import { describe, expect, it } from "vitest";
import { myFunction } from "./my-module";

describe("myFunction", () => {
  // Happy path
  it("returns expected result for valid input", () => {
    expect(myFunction("input")).toBe("expected");
  });

  // Edge cases
  it("handles empty string", () => {
    expect(myFunction("")).toBe("");
  });

  it("handles null/undefined", () => {
    expect(myFunction(null as unknown as string)).toBe("");
  });

  // Error cases
  it("throws for invalid input", () => {
    expect(() => myFunction(-1 as unknown as string)).toThrow();
  });

  // Boundary
  it("handles maximum length input", () => {
    const long = "x".repeat(10000);
    expect(myFunction(long)).toBeDefined();
  });
});
*/

// ============================================================
// TEMPLATE 2: Zustand store (entities/*)
// ============================================================
/*
import { afterEach, describe, expect, it } from "vitest";
import { useMyStore } from "./my.model";

describe("useMyStore", () => {
  afterEach(() => {
    useMyStore.setState({ items: [], loading: false });
    localStorage.clear();
  });

  describe("initial state", () => {
    it("starts empty", () => {
      expect(useMyStore.getState().items).toHaveLength(0);
      expect(useMyStore.getState().loading).toBe(false);
    });
  });

  describe("addItem", () => {
    it("adds item to the list", () => {
      useMyStore.getState().addItem({ id: 1, name: "Test" });
      expect(useMyStore.getState().items).toHaveLength(1);
      expect(useMyStore.getState().items[0]!.name).toBe("Test");
    });

    it("prevents duplicate IDs", () => {
      useMyStore.getState().addItem({ id: 1, name: "A" });
      useMyStore.getState().addItem({ id: 1, name: "B" });
      expect(useMyStore.getState().items).toHaveLength(1);
    });
  });

  describe("removeItem", () => {
    it("removes by ID", () => {
      useMyStore.getState().addItem({ id: 1, name: "Test" });
      useMyStore.getState().removeItem(1);
      expect(useMyStore.getState().items).toHaveLength(0);
    });

    it("no-op for unknown ID", () => {
      useMyStore.getState().addItem({ id: 1, name: "Test" });
      useMyStore.getState().removeItem(999);
      expect(useMyStore.getState().items).toHaveLength(1);
    });
  });

  describe("derived getters", () => {
    it("getById returns correct item", () => {
      useMyStore.getState().addItem({ id: 1, name: "Test" });
      expect(useMyStore.getState().getById(1)?.name).toBe("Test");
    });

    it("getById returns undefined for missing", () => {
      expect(useMyStore.getState().getById(999)).toBeUndefined();
    });
  });
});
*/

// ============================================================
// TEMPLATE 3: API function (entities/*/api.ts)
// ============================================================
/*
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { fetchItems } from "./my.api";

const server = setupServer(
  http.get("*\/api/v1/items", () => {
    return HttpResponse.json({
      result: "success",
      items: [{ id: 1, name: "Test" }],
    });
  }),
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("fetchItems", () => {
  it("returns items on success", async () => {
    const result = await fetchItems();
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("Test");
  });

  it("handles server error", async () => {
    server.use(
      http.get("*\/api/v1/items", () => {
        return HttpResponse.json({ result: "error" }, { status: 500 });
      }),
    );
    await expect(fetchItems()).rejects.toThrow();
  });

  it("handles empty response", async () => {
    server.use(
      http.get("*\/api/v1/items", () => {
        return HttpResponse.json({ result: "success", items: [] });
      }),
    );
    const result = await fetchItems();
    expect(result).toHaveLength(0);
  });
});
*/

// ============================================================
// TEMPLATE 4: Feature (features/*)
// ============================================================
/*
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFeatureStore } from "./feature.model";

describe("Feature: send-message", () => {
  afterEach(() => {
    useFeatureStore.getState().clear();
  });

  describe("when user types and sends", () => {
    it("clears the draft after sending", async () => {
      useFeatureStore.getState().setDraft("Hello");
      await useFeatureStore.getState().send();
      expect(useFeatureStore.getState().draft).toBe("");
    });

    it("shows error on network failure", async () => {
      vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("Network"));
      useFeatureStore.getState().setDraft("Hello");
      await useFeatureStore.getState().send();
      expect(useFeatureStore.getState().error).toBeTruthy();
    });
  });

  describe("when user edits a message", () => {
    it("updates content and clears edit mode", async () => {
      useFeatureStore.getState().startEdit(42, "Old text");
      useFeatureStore.getState().setDraft("New text");
      await useFeatureStore.getState().saveEdit();
      expect(useFeatureStore.getState().editingMessageId).toBeNull();
    });
  });
});
*/

export {};
