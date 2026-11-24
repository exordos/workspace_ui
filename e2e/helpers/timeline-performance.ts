import type { CDPSession, Page } from "@playwright/test";

const ROW_SELECTOR = "[data-workspace-scroll-controller='true'] [data-message-uuid]";

interface RowFiber {
  type: { name?: string } | null;
  memoizedProps?: { message?: { key: string; message?: { uuid: string } } };
  flags: number;
  child: RowFiber | null;
  sibling: RowFiber | null;
}

interface TimelineSample {
  visibleMs: number;
  longestFrameMs: number;
  rows: number;
  rowCommits: number;
  changedRowUuids: string[];
  reactObserverMs: number;
  viewport: { width: number; height: number };
}

type TimelineRowWork = Pick<TimelineSample, "rowCommits" | "changedRowUuids" | "reactObserverMs">;

declare global {
  interface Window {
    __timelineMeasurement: {
      begin(expectedRows: number, edit?: { uuid: string; text: string }): void;
      finish(): Promise<TimelineSample>;
      finishEdit(): TimelineRowWork; // Keep tracking committed rows after the first visible frame.
    };
  }
}

/** Record committed React row work and the first frame that displays the expected result. */
export async function installTimelineProbe(page: Page): Promise<void> {
  await page.addInitScript((rowSelector) => {
    let currentRoot: RowFiber | null = null;
    let sample: Promise<TimelineSample> | null = null;
    let readCommit: ((root: RowFiber) => void) | null = null;
    let readEditWork: (() => TimelineRowWork) | null = null;

    function readRows(root: RowFiber | null): Map<string, RowFiber> {
      const rows = new Map<string, RowFiber>();
      const pending = root == null ? [] : [root];
      while (pending.length > 0) {
        const fiber = pending.pop()!;
        if (fiber.sibling != null) pending.push(fiber.sibling);
        if (fiber.type?.name === "WorkspaceMessageListRow") {
          const item = fiber.memoizedProps?.message;
          if (item != null) rows.set(item.message?.uuid ?? item.key, fiber);
        } else if (fiber.child != null) {
          pending.push(fiber.child);
        }
      }
      return rows;
    }

    Object.defineProperty(window, "__REACT_DEVTOOLS_GLOBAL_HOOK__", {
      value: {
        renderers: new Map(),
        supportsFiber: true,
        inject: () => 1,
        onCommitFiberRoot: (_id: number, root: { current: RowFiber }) => {
          currentRoot = root.current;
          readCommit?.(root.current);
        },
      },
    });

    window.__timelineMeasurement = {
      begin(expectedRows, edit) {
        const changedRows = new Set<string>();
        let previousRows = readRows(currentRoot);
        let reactObserverMs = 0;
        let rowCommits = 0;
        const rowWork = () => ({ rowCommits, changedRowUuids: [...changedRows], reactObserverMs });
        readEditWork = edit == null ? null : rowWork;
        readCommit = (root) => {
          const start = performance.now();
          const rows = readRows(root);
          for (const [uuid, fiber] of rows) {
            // React 19 PerformedWork marks rendered rows. Bailouts can reuse the previous fiber.
            if (previousRows.get(uuid) !== fiber && (fiber.flags & 1) !== 0) {
              changedRows.add(uuid);
              rowCommits += 1;
            }
          }
          previousRows = rows;
          reactObserverMs += performance.now() - start;
        };

        const startedAt = performance.now();
        let lastFrameAt = startedAt;
        let longestFrameMs = 0;
        sample = new Promise((resolve, reject) => {
          function measureFrame(): void {
            const now = performance.now();
            longestFrameMs = Math.max(longestFrameMs, now - lastFrameAt);
            lastFrameAt = now;

            const rows = document.querySelectorAll(rowSelector).length;
            const editedRow =
              edit == null
                ? null
                : document.querySelector(`${rowSelector}[data-message-uuid='${edit.uuid}']`);
            if (
              rows === expectedRows &&
              (edit == null || editedRow?.textContent?.includes(edit.text))
            ) {
              if (edit == null) readCommit = null;
              resolve({
                visibleMs: now - startedAt,
                longestFrameMs,
                rows,
                ...rowWork(),
                viewport: { width: window.innerWidth, height: window.innerHeight },
              });
              return;
            }
            if (now - startedAt > 10_000) {
              readCommit = null;
              readEditWork = null;
              reject(new Error(`Timeline displayed ${rows} rows, expected ${expectedRows}`));
              return;
            }
            requestAnimationFrame(measureFrame);
          }
          requestAnimationFrame(measureFrame);
        });
      },
      finish() {
        if (sample == null) throw new Error("Start the timeline probe before reading it");
        return sample;
      },
      finishEdit() {
        if (readEditWork == null) throw new Error("Start an edit before reading settled row work");
        const work = readEditWork();
        readEditWork = null;
        readCommit = null;
        return work;
      },
    };
  }, ROW_SELECTOR);
}

export interface TimelineCpu {
  taskMs: number;
  scriptMs: number;
  layoutMs: number;
}

/** Chromium main-thread CPU counters, accumulated since Performance.enable. */
export async function readTimelineCpu(cdp: CDPSession): Promise<TimelineCpu> {
  const { metrics } = await cdp.send("Performance.getMetrics");
  const values = new Map(metrics.map(({ name, value }) => [name, value * 1000]));
  return {
    taskMs: values.get("TaskDuration") ?? 0,
    scriptMs: values.get("ScriptDuration") ?? 0,
    layoutMs: values.get("LayoutDuration") ?? 0,
  };
}
