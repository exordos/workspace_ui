import { spawn } from "node:child_process";
import { Socket } from "node:net";

export function relaunchDebAppAfterExit(executable: string, args: string[]): void {
  // Electron's Linux relaunch helper can set no_new_privs, which prevents
  // pkexec from elevating on the next update. Start directly from this process.
  // Close descriptors inherited from Electron, then wait for the parent to exit.
  const relauncher = spawn(
    "/bin/bash",
    [
      "-c",
      `
        for entry in /proc/self/fd/*; do
          fd="\${entry##*/}"
          if [[ $fd =~ ^[0-9]+$ && $fd -gt 2 ]]; then
            exec {fd}>&-
          fi
        done
        while IFS= read -r line; do :; done
        exec "$@" </dev/null
      `,
      "workspace",
      executable,
      ...args,
    ],
    {
      detached: true,
      stdio: ["pipe", "ignore", "ignore"],
      env: { ...process.env, BASH_ENV: undefined },
    },
  );

  relauncher.once("error", (error) => {
    console.error("[electron] Failed to restart after Debian update:", error.message);
  });
  if (relauncher.stdin instanceof Socket) relauncher.stdin.unref();
  relauncher.unref();
}
