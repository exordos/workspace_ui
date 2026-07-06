import { messengerRequestBinaryResult } from "./messenger-transport.internal";
import type { MessengerBinaryResult, MessengerClientOptions } from "./messenger-transport.internal";

export async function downloadWorkspaceFile(
  options: MessengerClientOptions,
  fileUuid: string,
): Promise<MessengerBinaryResult> {
  return messengerRequestBinaryResult(
    `/files/${encodeURIComponent(fileUuid)}/actions/download`,
    options,
  );
}
