import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearLogHistory, createLogger, setMinLevel } from "~/shared/lib/logger";
import { renderWithProviders } from "~/test/render";
import { LogsPage } from "./logs-page.ui";

const downloadLogsAsFileMock = vi.fn();

vi.mock("./logs-export.lib", () => ({
  downloadLogsAsFile: (...args: unknown[]) => downloadLogsAsFileMock(...args),
}));

function openLogsModal() {
  fireEvent.click(screen.getAllByRole("button", { name: /view logs/i })[0]!);
}

describe("LogsPage", () => {
  beforeEach(() => {
    clearLogHistory();
    setMinLevel("debug");
    downloadLogsAsFileMock.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    clearLogHistory();
    vi.restoreAllMocks();
  });

  it("renders in-memory log entries in the logs modal", () => {
    const log = createLogger("logs-test");
    log.warn("Something odd happened", { status: 500 });

    renderWithProviders(<LogsPage />);
    openLogsModal();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/something odd happened/i)).toBeInTheDocument();
    expect(screen.getAllByText(/logs-test/i).length).toBeGreaterThan(0);
  });

  it("keeps log list hidden until the modal is opened", () => {
    const log = createLogger("logs-test");
    log.info("Hidden until modal opens");

    renderWithProviders(<LogsPage />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText(/hidden until modal opens/i)).not.toBeInTheDocument();
  });

  it("clears log history from the modal", () => {
    const log = createLogger("logs-test");
    log.error("Critical issue");

    renderWithProviders(<LogsPage />);
    openLogsModal();
    fireEvent.click(screen.getByRole("button", { name: /clear logs/i }));

    expect(screen.getByText(/no logs yet/i)).toBeInTheDocument();
  });

  it("exports current log history on demand from the modal", () => {
    const log = createLogger("logs-test");
    log.info("Ready to export");

    renderWithProviders(<LogsPage />);
    openLogsModal();
    fireEvent.click(screen.getByRole("button", { name: /export logs/i }));

    expect(downloadLogsAsFileMock).toHaveBeenCalledTimes(1);
  });

  it("filters displayed entries by selected log level", () => {
    const log = createLogger("logs-test");
    log.info("Info entry");
    log.error("Error entry");

    renderWithProviders(<LogsPage />);
    openLogsModal();

    fireEvent.change(screen.getByRole("combobox", { name: /log level/i }), {
      target: { value: "error" },
    });

    const logList = within(screen.getByRole("list", { name: /session log entries/i }));
    expect(logList.getByText(/error entry/i)).toBeInTheDocument();
    expect(logList.queryByText(/info entry/i)).not.toBeInTheDocument();
  });

  it("filters entries by scope and search query", () => {
    const alphaLog = createLogger("alpha-scope");
    const betaLog = createLogger("beta-scope");
    alphaLog.info("alpha handshake complete");
    betaLog.error("beta critical failure");

    renderWithProviders(<LogsPage />);
    openLogsModal();

    fireEvent.change(screen.getByRole("combobox", { name: /log scope/i }), {
      target: { value: "beta-scope" },
    });

    const logList = within(screen.getByRole("list", { name: /session log entries/i }));
    expect(logList.getByText(/beta critical failure/i)).toBeInTheDocument();
    expect(logList.queryByText(/alpha handshake complete/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: /search logs/i }), {
      target: { value: "critical" },
    });
    expect(logList.getByText(/beta critical failure/i)).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: /search logs/i }), {
      target: { value: "handshake" },
    });
    expect(logList.queryByText(/beta critical failure/i)).not.toBeInTheDocument();
  });

  it("does not render settings navigation action in diagnostics header", () => {
    renderWithProviders(<LogsPage />);

    expect(screen.queryByRole("button", { name: /^settings$/i })).not.toBeInTheDocument();
  });

  it("renders compact filter controls to preserve log viewport space", () => {
    renderWithProviders(<LogsPage />);
    openLogsModal();

    const searchInput = screen.getByRole("searchbox", { name: /search logs/i });
    const resetButton = screen.getByRole("button", { name: /reset filters/i });

    expect(searchInput).toHaveClass("h-8");
    expect(resetButton).toHaveClass("h-8");
    expect(resetButton).not.toHaveClass("mt-5");
  });

  it("updates list when new logs arrive via subscribeLogHistory", async () => {
    renderWithProviders(<LogsPage />);
    openLogsModal();
    expect(screen.queryByText(/live entry/i)).not.toBeInTheDocument();

    const log = createLogger("live-subscribe");
    log.info("Live entry");

    await waitFor(() => {
      expect(screen.getByText(/live entry/i)).toBeInTheDocument();
    });
  });

  it("filters entries by log source", () => {
    const apiLog = createLogger("api");
    const actionLog = createLogger("action");
    apiLog.info("API trace");
    actionLog.info("User switched org");

    renderWithProviders(<LogsPage />);
    openLogsModal();

    fireEvent.change(screen.getByRole("combobox", { name: /log source/i }), {
      target: { value: "actions" },
    });

    expect(screen.getByText(/user switched org/i)).toBeInTheDocument();
    expect(screen.queryByText(/api trace/i)).not.toBeInTheDocument();
  });

  it("renders compact log rows for denser diagnostics scanning", () => {
    const log = createLogger("compact-row");
    log.info("Compact row entry");

    renderWithProviders(<LogsPage />);
    openLogsModal();

    const entryMessage = screen.getByText(/compact row entry/i);
    const row = entryMessage.closest("li");

    expect(row).not.toBeNull();
    expect(row).toHaveClass("p-2");
    expect(entryMessage).toHaveClass("text-xs");
  });

  it("opens logs modal from overview log counts card", () => {
    renderWithProviders(<LogsPage />);

    const viewLogButtons = screen.getAllByRole("button", { name: /view logs/i });
    fireEvent.click(viewLogButtons[1]!);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^logs$/i })).toBeInTheDocument();
  });

  it("renders memory section summary", () => {
    renderWithProviders(<LogsPage />);
    expect(screen.getByText(/^memory$/i)).toBeInTheDocument();
  });

  it("renders diagnostics overview cards", () => {
    renderWithProviders(<LogsPage />);
    expect(screen.getByText(/^connection$/i)).toBeInTheDocument();
    expect(screen.getByText(/^realtime$/i)).toBeInTheDocument();
    expect(screen.getByText(/^session$/i)).toBeInTheDocument();
  });

  it("shows recent errors section when errors exist", () => {
    const log = createLogger("logs-test");
    log.error("Recent failure");

    renderWithProviders(<LogsPage />);
    openLogsModal();

    expect(screen.getByText(/recent errors/i)).toBeInTheDocument();
    expect(screen.getAllByText(/recent failure/i).length).toBeGreaterThan(0);
  });

  it("shows js heap metrics in Chromium without expanding a section", async () => {
    vi.stubGlobal("performance", {
      memory: {
        usedJSHeapSize: 20 * 1024 * 1024,
        totalJSHeapSize: 24 * 1024 * 1024,
        jsHeapSizeLimit: 100 * 1024 * 1024,
      },
    });

    renderWithProviders(<LogsPage />);

    await waitFor(() => {
      expect(screen.getByText(/20\.0 MB/i)).toBeInTheDocument();
    });

    vi.unstubAllGlobals();
  });

  it("shows electron process table and cpu column when electron diagnostics API is available", async () => {
    vi.stubGlobal("performance", {
      memory: {
        usedJSHeapSize: 20 * 1024 * 1024,
        totalJSHeapSize: 24 * 1024 * 1024,
        jsHeapSizeLimit: 100 * 1024 * 1024,
      },
    });
    (window as unknown as Record<string, unknown>).electronAPI = {
      platform: "darwin",
      diagnostics: {
        getMemorySnapshot: vi.fn().mockResolvedValue({
          collectedAt: "2026-01-01T00:00:00.000Z",
          main: { rss: 100, heapUsed: 50, heapTotal: 80, external: 0, arrayBuffers: 0 },
          system: { total: 16000, free: 8000 },
          processes: [
            {
              pid: 42,
              type: "Browser",
              memory: { workingSetSize: 256, peakWorkingSetSize: 300 },
              cpu: { percentCPUUsage: 12.5 },
            },
          ],
          totalWorkingSetKb: 256,
        }),
        getRendererMemory: vi.fn().mockResolvedValue({
          processMemory: { private: 200, residentSet: 180, shared: 20 },
          heapStatistics: { usedHeapSize: 64 },
          blinkMemoryInfo: { allocated: 32, total: 40 },
        }),
      },
    };

    renderWithProviders(<LogsPage />);

    await waitFor(() => {
      expect(screen.getByText("Browser")).toBeInTheDocument();
      expect(screen.getByText("42")).toBeInTheDocument();
      expect(screen.getByText("12.5%")).toBeInTheDocument();
    });

    delete (window as unknown as Record<string, unknown>).electronAPI;
    vi.unstubAllGlobals();
  });
});
