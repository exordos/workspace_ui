import { execFile } from "node:child_process";
import { hostname } from "node:os";
import { promisify } from "node:util";
import type { IpcMainInvokeEvent, WebContents } from "electron";

const execFileAsync = promisify(execFile);
const COMMAND_OPTIONS = {
  timeout: 1_000,
  maxBuffer: 16 * 1024,
  killSignal: "SIGKILL" as const,
  windowsHide: true,
};

interface DeviceNameSources {
  platform: NodeJS.Platform;
  hostname: () => string;
  runCommand: (file: string, args: string[], options: typeof COMMAND_OPTIONS) => Promise<string>;
}

const systemSources: DeviceNameSources = {
  platform: process.platform,
  hostname,
  runCommand: async (file, args, options) => (await execFileAsync(file, args, options)).stdout,
};

export async function resolveSystemDeviceName(
  sources: DeviceNameSources = systemSources,
): Promise<string | null> {
  const command =
    sources.platform === "darwin"
      ? { file: "/usr/sbin/scutil", args: ["--get", "ComputerName"] }
      : sources.platform === "linux"
        ? { file: "/usr/bin/hostnamectl", args: ["--pretty"] }
        : null;

  if (command) {
    try {
      const name = (await sources.runCommand(command.file, command.args, COMMAND_OPTIONS)).trim();
      if (name) return name;
    } catch {
      // Pretty names are optional and must not prevent device registration.
    }
  }

  try {
    return sources.hostname().trim() || null;
  } catch {
    return null;
  }
}

function isTrustedDeviceNameSender(
  event: Pick<IpcMainInvokeEvent, "sender" | "senderFrame">,
  mainWebContents: WebContents | null,
  shellUrl: string,
): boolean {
  try {
    if (
      !mainWebContents ||
      mainWebContents.isDestroyed() ||
      event.sender !== mainWebContents ||
      event.senderFrame !== mainWebContents.mainFrame ||
      event.senderFrame.detached
    ) {
      return false;
    }

    const actual = new URL(event.senderFrame.url);
    const expected = new URL(shellUrl);
    if (actual.username || actual.password || actual.protocol !== expected.protocol) return false;
    return expected.protocol === "file:"
      ? actual.host === expected.host && actual.pathname === expected.pathname
      : actual.origin === expected.origin;
  } catch {
    return false;
  }
}

export async function getDeviceNameForRequest(
  event: Pick<IpcMainInvokeEvent, "sender" | "senderFrame">,
  mainWebContents: WebContents | null,
  shellUrl: string,
  resolveName: () => Promise<string | null> = resolveSystemDeviceName,
): Promise<string | null> {
  if (!isTrustedDeviceNameSender(event, mainWebContents, shellUrl)) return null;
  const name = await resolveName();
  // A command may finish after the shell has navigated or closed.
  return isTrustedDeviceNameSender(event, mainWebContents, shellUrl) ? name : null;
}
