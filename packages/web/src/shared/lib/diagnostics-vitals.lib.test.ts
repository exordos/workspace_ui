import { describe, expect, it, beforeEach } from "vitest";
import {
  getDiagnosticVitalsSnapshot,
  recordDiagnosticVital,
  resetDiagnosticVitalsForTests,
} from "./diagnostics-vitals.lib";

describe("diagnostics-vitals", () => {
  beforeEach(() => {
    resetDiagnosticVitalsForTests();
  });

  it("stores and returns latest vital values", () => {
    recordDiagnosticVital("largest-contentful-paint", 1200);
    recordDiagnosticVital("layout-shift", 0.05);

    const snapshot = getDiagnosticVitalsSnapshot();
    expect(snapshot).toHaveLength(2);
    expect(snapshot.some((entry) => entry.name === "largest-contentful-paint")).toBe(true);
  });
});
