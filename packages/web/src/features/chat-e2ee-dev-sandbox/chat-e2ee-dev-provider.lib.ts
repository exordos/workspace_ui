import type {
  ChatCryptoGrantContext,
  ChatCryptoGroupKey,
  ChatCryptoProvider,
  ChatCryptoResult,
} from "~/entities/messenger/chat-crypto-provider.types";

export const E2EE_SANDBOX_FIXTURE_TEXT = "INSECURE E2EE sandbox fixture";
export const E2EE_SANDBOX_FINGERPRINT = { bytes: new Uint8Array([70, 73, 88]) };
export const E2EE_SANDBOX_GROUP_KEY = { bytes: new Uint8Array(32).fill(42) };
const ok = <T>(value: T): ChatCryptoResult<T> => ({ ok: true, value });
const invalid = (): ChatCryptoResult<never> => ({ ok: false, reason: "invalid-ciphertext" });
const same = (left: Uint8Array, right: Uint8Array) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

/** Encoding for nonsecret fixtures only; never a cryptographic implementation. */
export function createInsecureSandboxProvider(): ChatCryptoProvider {
  if (!import.meta.env.DEV) throw new Error("E2EE sandbox is development only");
  const encoder = new TextEncoder();
  const grants = new Map<
    string,
    { context: ChatCryptoGrantContext; recipient: Uint8Array; groupKey: ChatCryptoGroupKey }
  >();
  return {
    createRequestKeyPair: () => {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      return Promise.resolve(ok({ publicKey: { bytes }, privateKey: bytes }));
    },
    createGroupKey: () => Promise.resolve(ok(E2EE_SANDBOX_GROUP_KEY)),
    fingerprintGroupKey: () => Promise.resolve(ok(E2EE_SANDBOX_FINGERPRINT)),
    encryptMessage: ({ plaintext, groupKey }) =>
      Promise.resolve(
        same(plaintext, encoder.encode(E2EE_SANDBOX_FIXTURE_TEXT)) &&
          same(groupKey.bytes, E2EE_SANDBOX_GROUP_KEY.bytes)
          ? ok({ bytes: encoder.encode(E2EE_SANDBOX_FIXTURE_TEXT) })
          : invalid(),
      ),
    decryptMessage: ({ envelope, groupKey }) =>
      Promise.resolve(
        same(envelope.bytes, encoder.encode(E2EE_SANDBOX_FIXTURE_TEXT)) &&
          same(groupKey.bytes, E2EE_SANDBOX_GROUP_KEY.bytes)
          ? ok(encoder.encode(E2EE_SANDBOX_FIXTURE_TEXT))
          : invalid(),
      ),
    encryptGroupKeyGrant: ({ context, recipientPublicKey, groupKey }) => {
      if (!same(groupKey.bytes, E2EE_SANDBOX_GROUP_KEY.bytes)) return Promise.resolve(invalid());
      const token = `insecure-fixture-grant-${grants.size + 1}`;
      grants.set(token, { context, recipient: recipientPublicKey.bytes, groupKey });
      return Promise.resolve(ok({ bytes: encoder.encode(token) }));
    },
    decryptGroupKeyGrant: ({ envelope, context, requestKeyPair, expectedFingerprint }) => {
      const grant = grants.get(new TextDecoder().decode(envelope.bytes));
      return Promise.resolve(
        grant &&
          JSON.stringify(grant.context) === JSON.stringify(context) &&
          same(grant.recipient, requestKeyPair.publicKey.bytes) &&
          same(grant.recipient, requestKeyPair.privateKey) &&
          same(expectedFingerprint.bytes, E2EE_SANDBOX_FINGERPRINT.bytes)
          ? ok(grant.groupKey)
          : invalid(),
      );
    },
  };
}
