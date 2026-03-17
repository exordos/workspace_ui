import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearLogHistory, createLogger, setMinLevel } from "~/shared/lib/logger";
import { renderWithProviders } from "~/test/render";
import { LogsPage } from "./logs-page.ui";

const downloadLogsAsFileMock = vi.fn();

vi.mock("./logs-export.lib", () => ({
  downloadLogsAsFile: (...args: unknown[]) => downloadLogsAsFileMock(...args),
}));

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

  it("renders in-memory log entries", () => {
    const log = createLogger("logs-test");
    log.warn("Something odd happened", { status: 500 });

    renderWithProviders(<LogsPage />);

    expect(screen.getByRole("heading", { name: /diagnostics/i })).toBeInTheDocument();
    expect(screen.getByText(/something odd happened/i)).toBeInTheDocument();
    expect(screen.getAllByText(/logs-test/i).length).toBeGreaterThan(0);
  });

  it("clears log history from the page", () => {
    const log = createLogger("logs-test");
    log.error("Critical issue");

    renderWithProviders(<LogsPage />);
    fireEvent.click(screen.getByRole("button", { name: /clear logs/i }));

    expect(screen.getByText(/no logs yet/i)).toBeInTheDocument();
  });

  it("exports current log history on demand", () => {
    const log = createLogger("logs-test");
    log.info("Ready to export");

    renderWithProviders(<LogsPage />);
    fireEvent.click(screen.getByRole("button", { name: /export logs/i }));

    expect(downloadLogsAsFileMock).toHaveBeenCalledTimes(1);
  });

  it("filters displayed entries by selected log level", () => {
    const log = createLogger("logs-test");
    log.info("Info entry");
    log.error("Error entry");

    renderWithProviders(<LogsPage />);

    fireEvent.change(screen.getByRole("combobox", { name: /log level/i }), {
      target: { value: "error" },
    });

    expect(screen.getByText(/error entry/i)).toBeInTheDocument();
    expect(screen.queryByText(/info entry/i)).not.toBeInTheDocument();
  });

  it("filters entries by scope and search query", () => {
    const alphaLog = createLogger("alpha-scope");
    const betaLog = createLogger("beta-scope");
    alphaLog.info("alpha handshake complete");
    betaLog.error("beta critical failure");

    renderWithProviders(<LogsPage />);

    fireEvent.change(screen.getByRole("combobox", { name: /log scope/i }), {
      target: { value: "beta-scope" },
    });

    expect(screen.getByText(/beta critical failure/i)).toBeInTheDocument();
    expect(screen.queryByText(/alpha handshake complete/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: /search logs/i }), {
      target: { value: "critical" },
    });
    expect(screen.getByText(/beta critical failure/i)).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: /search logs/i }), {
      target: { value: "handshake" },
    });
    expect(screen.getByText(/no logs yet/i)).toBeInTheDocument();
  });

  it("does not render settings navigation action in diagnostics header", () => {
    renderWithProviders(<LogsPage />);

    expect(screen.queryByRole("button", { name: /^settings$/i })).not.toBeInTheDocument();
  });

  it("renders compact filter controls to preserve log viewport space", () => {
    renderWithProviders(<LogsPage />);

    const searchInput = screen.getByRole("searchbox", { name: /search logs/i });
    const resetButton = screen.getByRole("button", { name: /reset filters/i });

    expect(searchInput).toHaveClass("h-8");
    expect(resetButton).toHaveClass("h-8");
    expect(resetButton).not.toHaveClass("mt-5");
  });

  it("renders compact log rows for denser diagnostics scanning", () => {
    const log = createLogger("compact-row");
    log.info("Compact row entry");

    renderWithProviders(<LogsPage />);

    const entryMessage = screen.getByText(/compact row entry/i);
    const row = entryMessage.closest("li");

    expect(row).not.toBeNull();
    expect(row).toHaveClass("p-2");
    expect(entryMessage).toHaveClass("text-xs");
  });
});
