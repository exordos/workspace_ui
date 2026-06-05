/**
 * In-memory ring buffer for Web Vitals shown on the diagnostics page (dev-only).
 */

export interface DiagnosticVitalEntry {
  name: string;
  value: number;
  recordedAt: number;
}

const MAX_VITALS = 8;
const vitalsByName = new Map<string, DiagnosticVitalEntry>();

/** Records or updates the latest value for a vital metric. */
export function recordDiagnosticVital(name: string, value: number): void {
  if (!Number.isFinite(value)) return;
  vitalsByName.set(name, { name, value, recordedAt: Date.now() });
  if (vitalsByName.size <= MAX_VITALS) return;
  const oldest = [...vitalsByName.values()].sort((a, b) => a.recordedAt - b.recordedAt)[0];
  if (oldest != null) {
    vitalsByName.delete(oldest.name);
  }
}

export function getDiagnosticVitalsSnapshot(): readonly DiagnosticVitalEntry[] {
  return [...vitalsByName.values()].sort((a, b) => a.recordedAt - b.recordedAt);
}

export function resetDiagnosticVitalsForTests(): void {
  vitalsByName.clear();
}
