import {
  ensureChatDeviceIdentity,
  notifyRealChatKeyChanges,
  realChatCryptoProvider,
  realChatKeyStorage,
} from "./chat-crypto-resources.lib";
import { MessengerChannelCreationError } from "./chat-initial-key-bootstrap.lib";
import type { ChatInitialKeyBootstrap } from "./chat-initial-key-bootstrap.lib";

/** Persist before POST; an interrupted creation is reconciled by its generation fingerprint. */
export const realChatInitialKeyBootstrap: ChatInitialKeyBootstrap = {
  async prepare({ runtimeContext, isCurrent, signal }) {
    const current = () => isCurrent() && signal?.aborted !== true;
    const device = await ensureChatDeviceIdentity(runtimeContext, current);
    const groupKey = await realChatCryptoProvider.createGroupKey();
    if (!current() || !groupKey.ok)
      throw new MessengerChannelCreationError("encryption-unavailable");
    const keyUuid = crypto.randomUUID();
    const fingerprint = await realChatCryptoProvider.fingerprintGroupKey(groupKey.value, keyUuid);
    if (!current() || !fingerprint.ok)
      throw new MessengerChannelCreationError("encryption-unavailable");
    const creationId = crypto.randomUUID();
    const persisted = await realChatKeyStorage.writeStagedCreation(
      { owner: runtimeContext, deviceId: device.deviceId },
      { creationId, keyUuid, fingerprint: fingerprint.value, groupKey: groupKey.value },
      { isCurrent: current },
    );
    if (!current() || !persisted) throw new MessengerChannelCreationError("encryption-unavailable");
    return {
      keyUuid,
      keyFingerprint: fingerprint.value,
      creationId,
      deviceId: device.deviceId,
      source: "provider",
    };
  },
  async finalize({ runtimeContext, metadata, streamUuid, isCurrent }) {
    if (!metadata.creationId || !metadata.deviceId || !isCurrent())
      throw new MessengerChannelCreationError("encryption-unavailable");
    const committed = await realChatKeyStorage.finalizeCreation(
      { owner: runtimeContext, deviceId: metadata.deviceId },
      metadata.creationId,
      streamUuid,
      { isCurrent },
    );
    if (!isCurrent() || !committed)
      throw new MessengerChannelCreationError("encryption-unavailable");
    notifyRealChatKeyChanges();
  },
};
