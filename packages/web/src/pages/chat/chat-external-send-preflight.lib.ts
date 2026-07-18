import { EXTERNAL_CAPABILITY } from "~/features/external-accounts/external-capabilities.lib";
import type { ProviderSummary } from "~/shared/types/provider-delivery";

export interface ExternalSendTarget {
  type: "stream" | "topic";
  uuid: string;
}

interface PreflightRunInput {
  provider: ProviderSummary | null;
  action: typeof EXTERNAL_CAPABILITY.messageSend | typeof EXTERNAL_CAPABILITY.fileTransfer;
  target: ExternalSendTarget;
  execute: () => void | Promise<void>;
}

export interface ExecuteExternalPreflightedSendInput {
  provider: ProviderSummary | null;
  target: ExternalSendTarget | null;
  includesFiles: boolean;
  runPreflight: (input: PreflightRunInput) => Promise<void>;
  execute: () => void | Promise<void>;
}

/** Detects every attachment URN family supported by the message renderer and uploader. */
export function messageContentIncludesFileTransfer(content: string): boolean {
  return /urn:(?:file|image|video):/i.test(content);
}

/** Runs all provider gates before upload or optimistic message creation. */
export async function executeExternalPreflightedSend(
  input: ExecuteExternalPreflightedSendInput,
): Promise<void> {
  if (input.provider == null) {
    await input.execute();
    return;
  }
  if (input.target == null) {
    throw new Error("External message target is unavailable");
  }
  if (input.includesFiles) {
    await input.runPreflight({
      provider: input.provider,
      action: EXTERNAL_CAPABILITY.fileTransfer,
      target: input.target,
      execute: () => undefined,
    });
  }
  await input.runPreflight({
    provider: input.provider,
    action: EXTERNAL_CAPABILITY.messageSend,
    target: input.target,
    execute: input.execute,
  });
}
