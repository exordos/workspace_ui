import type {
  ChatCryptoGrantContext,
  ChatCryptoKeyPair,
  ChatCryptoProvider,
  ChatCryptoResult,
} from "~/entities/messenger/chat-crypto-provider.types";

export const E2EE_SANDBOX_FIXTURE_TEXT = "INSECURE E2EE sandbox fixture";
export const E2EE_SANDBOX_CHAT_PAIR = {
  publicKey: { bytes: new Uint8Array([70, 73, 88]) },
  privateKey: "fixture-chat-private",
};
export const E2EE_SANDBOX_DEVICE_PAIRS = {
  issuer: { publicKey: { bytes: new Uint8Array([1]) }, privateKey: "fixture-device-issuer" },
  recipient: { publicKey: { bytes: new Uint8Array([2]) }, privateKey: "fixture-device-recipient" },
} as const;

const ok = <T>(value: T): ChatCryptoResult<T> => ({ ok: true, value });
const invalid = (): ChatCryptoResult<never> => ({ ok: false, reason: "invalid-ciphertext" });
const same = (left: Uint8Array, right: Uint8Array) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

/** A mock, not cryptography. It only accepts the fixed nonsecret fixture text and keys. */
export function createInsecureSandboxProvider(): ChatCryptoProvider<string> {
  if (!import.meta.env.DEV) throw new Error("E2EE sandbox is development only");
  const encoder = new TextEncoder();
  const grants = new Map<
    string,
    { context: ChatCryptoGrantContext; recipient: Uint8Array; pair: ChatCryptoKeyPair<string> }
  >();
  return {
    createDeviceKeyPair: () => Promise.resolve(ok(E2EE_SANDBOX_DEVICE_PAIRS.recipient)),
    createChatKeyPair: () => Promise.resolve(ok(E2EE_SANDBOX_CHAT_PAIR)),
    encryptMessage: ({ plaintext, publicKey }) =>
      Promise.resolve(
        same(plaintext, encoder.encode(E2EE_SANDBOX_FIXTURE_TEXT)) &&
          same(publicKey.bytes, E2EE_SANDBOX_CHAT_PAIR.publicKey.bytes)
          ? ok({ bytes: encoder.encode(E2EE_SANDBOX_FIXTURE_TEXT) })
          : invalid(),
      ),
    decryptMessage: ({ envelope, keyPair }) =>
      Promise.resolve(
        same(envelope.bytes, encoder.encode(E2EE_SANDBOX_FIXTURE_TEXT)) &&
          keyPair.privateKey === E2EE_SANDBOX_CHAT_PAIR.privateKey
          ? ok(encoder.encode(E2EE_SANDBOX_FIXTURE_TEXT))
          : invalid(),
      ),
    encryptChatKeyGrant: ({ context, recipientPublicKey, chatKeyPair }) => {
      if (chatKeyPair.privateKey !== E2EE_SANDBOX_CHAT_PAIR.privateKey)
        return Promise.resolve(invalid());
      const token = `insecure-fixture-grant-${grants.size + 1}`;
      grants.set(token, { context, recipient: recipientPublicKey.bytes, pair: chatKeyPair });
      return Promise.resolve(ok({ bytes: encoder.encode(token) }));
    },
    decryptChatKeyGrant: ({ envelope, context, deviceKeyPair, expectedChatPublicKey }) => {
      const grant = grants.get(new TextDecoder().decode(envelope.bytes));
      return Promise.resolve(
        grant &&
          JSON.stringify(grant.context) === JSON.stringify(context) &&
          same(grant.recipient, deviceKeyPair.publicKey.bytes) &&
          same(grant.pair.publicKey.bytes, expectedChatPublicKey.bytes)
          ? ok(grant.pair)
          : invalid(),
      );
    },
  };
}
