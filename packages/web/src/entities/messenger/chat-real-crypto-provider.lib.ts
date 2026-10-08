import { Chacha20Poly1305 } from "@hpke/chacha20poly1305";
import { CipherSuite, HkdfSha256 } from "@hpke/core";
import { DhkemX25519HkdfSha256 } from "@hpke/dhkem-x25519";
import { chacha20poly1305 } from "@noble/ciphers/chacha.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import type {
  ChatCryptoEnvelope,
  ChatCryptoGrantContext,
  ChatCryptoGroupKey,
  ChatCryptoMessageContext,
  ChatCryptoProvider,
  ChatCryptoResult,
} from "./chat-crypto-provider.types";

const KEY_BYTES = 32;
const TAG_BYTES = 16;
// The fifth byte identifies this provider-owned binary format; it adds no API field.
const MESSAGE_MAGIC = new Uint8Array([87, 83, 67, 77, 1]);
const GRANT_MAGIC = new Uint8Array([87, 83, 67, 71, 1]);
const HEADER_BYTES = MESSAGE_MAGIC.length + KEY_BYTES;
const MAX_MESSAGE_BYTES = (2 ** 32 - 1) * 64;
const encoder = new TextEncoder();

function success<T>(value: T): ChatCryptoResult<T> {
  return { ok: true, value };
}

function promisedResult<T>(operation: () => ChatCryptoResult<T>): Promise<ChatCryptoResult<T>> {
  return Promise.resolve(operation());
}

function join(...parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index]! ^ right[index]!;
  }
  return difference === 0;
}

function validKey(bytes: Uint8Array): boolean {
  return (
    ArrayBuffer.isView(bytes) &&
    Object.prototype.toString.call(bytes) === "[object Uint8Array]" &&
    bytes.length === KEY_BYTES
  );
}

function validContext(context: ChatCryptoMessageContext): boolean {
  return context.streamUuid.length > 0 && context.keyUuid.length > 0;
}

function messageInfo(context: ChatCryptoMessageContext): Uint8Array {
  return encoder.encode(
    JSON.stringify(["workspace-chat-crypto-v1", "message", context.streamUuid, context.keyUuid]),
  );
}

function grantInfo(context: ChatCryptoGrantContext): Uint8Array {
  return encoder.encode(
    JSON.stringify([
      "workspace-chat-crypto-v1",
      "grant",
      context.streamUuid,
      context.keyUuid,
      context.requestMessageUuid,
      context.senderDeviceId,
      context.recipientDeviceId,
    ]),
  );
}

function validGrantContext(context: ChatCryptoGrantContext): boolean {
  return (
    validContext(context) &&
    context.requestMessageUuid.length > 0 &&
    context.senderDeviceId.length > 0 &&
    context.recipientDeviceId.length > 0
  );
}

function readHeader(bytes: Uint8Array, magic: Uint8Array): Uint8Array | null {
  if (
    bytes.length < HEADER_BYTES + TAG_BYTES ||
    !sameBytes(bytes.subarray(0, magic.length), magic)
  ) {
    return null;
  }
  return bytes.subarray(0, HEADER_BYTES);
}

function randomKey(): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(KEY_BYTES));
}

// Backend adapters transport opaque envelopes; their framing is owned by this provider.
export function createRealChatCryptoProvider(): ChatCryptoProvider<Uint8Array> {
  const suite = new CipherSuite({
    kem: new DhkemX25519HkdfSha256(),
    kdf: new HkdfSha256(),
    aead: new Chacha20Poly1305(),
  });

  return {
    async createRequestKeyPair() {
      try {
        const pair = await suite.kem.generateKeyPair();
        const [publicKey, privateKey] = await Promise.all([
          suite.kem.serializePublicKey(pair.publicKey),
          suite.kem.serializePrivateKey(pair.privateKey),
        ]);
        return success({
          publicKey: { bytes: new Uint8Array(publicKey) },
          privateKey: new Uint8Array(privateKey),
        });
      } catch {
        return { ok: false, reason: "unavailable" };
      }
    },
    createGroupKey() {
      return promisedResult<ChatCryptoGroupKey>(() => {
        try {
          return success({ bytes: randomKey() });
        } catch {
          return { ok: false, reason: "unavailable" };
        }
      });
    },
    encryptMessage({ groupKey, plaintext, context }) {
      return promisedResult<ChatCryptoEnvelope>(() => {
        if (!validKey(groupKey.bytes)) return { ok: false, reason: "invalid-key" };
        if (!validContext(context)) return { ok: false, reason: "context-mismatch" };
        if (plaintext.length > MAX_MESSAGE_BYTES)
          return { ok: false, reason: "invalid-ciphertext" };
        let salt: Uint8Array;
        try {
          salt = randomKey();
        } catch {
          return { ok: false, reason: "unavailable" };
        }
        const info = messageInfo(context);
        const header = join(MESSAGE_MAGIC, salt);
        const messageKey = hkdf(sha256, groupKey.bytes, salt, info, KEY_BYTES);
        try {
          // A fresh 256-bit salt gives each encryption its own key across devices and reloads.
          // The fixed nonce is used exactly once per derived key; no shared counter is required.
          const ciphertext = chacha20poly1305(
            messageKey,
            new Uint8Array(12),
            join(info, header),
          ).encrypt(plaintext);
          return success({ bytes: join(header, ciphertext) });
        } catch {
          return { ok: false, reason: "invalid-ciphertext" };
        } finally {
          messageKey.fill(0);
        }
      });
    },
    decryptMessage({ groupKey, envelope, context }) {
      return promisedResult<Uint8Array>(() => {
        if (!validKey(groupKey.bytes)) return { ok: false, reason: "invalid-key" };
        if (!validContext(context)) return { ok: false, reason: "context-mismatch" };
        const header = readHeader(envelope.bytes, MESSAGE_MAGIC);
        if (!header) return { ok: false, reason: "invalid-ciphertext" };
        const ciphertext = envelope.bytes.subarray(HEADER_BYTES);
        if (ciphertext.length - TAG_BYTES > MAX_MESSAGE_BYTES) {
          return { ok: false, reason: "invalid-ciphertext" };
        }
        const info = messageInfo(context);
        const messageKey = hkdf(
          sha256,
          groupKey.bytes,
          header.subarray(MESSAGE_MAGIC.length),
          info,
          KEY_BYTES,
        );
        try {
          return success(
            chacha20poly1305(messageKey, new Uint8Array(12), join(info, header)).decrypt(
              ciphertext,
            ),
          );
        } catch {
          return { ok: false, reason: "invalid-ciphertext" };
        } finally {
          messageKey.fill(0);
        }
      });
    },
    async encryptGroupKeyGrant({ groupKey, recipientPublicKey, context }) {
      if (!validKey(groupKey.bytes) || !validKey(recipientPublicKey.bytes)) {
        return { ok: false, reason: "invalid-key" };
      }
      if (!validGrantContext(context)) return { ok: false, reason: "context-mismatch" };
      const secret = groupKey.bytes.slice();
      const publicBytes = recipientPublicKey.bytes.slice();
      const info = grantInfo(context);
      try {
        const recipientPublic = await suite.kem.deserializePublicKey(publicBytes);
        const sealed = await suite.seal(
          { recipientPublicKey: recipientPublic, info },
          secret,
          join(info, GRANT_MAGIC, publicBytes),
        );
        return success({
          bytes: join(GRANT_MAGIC, new Uint8Array(sealed.enc), new Uint8Array(sealed.ct)),
        });
      } catch {
        return { ok: false, reason: "invalid-key" };
      } finally {
        secret.fill(0);
      }
    },
    async decryptGroupKeyGrant({ requestKeyPair, envelope, context }) {
      if (
        !validKey(requestKeyPair.privateKey) ||
        !validKey(requestKeyPair.publicKey.bytes) ||
        !validGrantContext(context)
      )
        return { ok: false, reason: "invalid-key" };
      if (!validGrantContext(context)) return { ok: false, reason: "context-mismatch" };
      const bytes = envelope.bytes.slice();
      const header = readHeader(bytes, GRANT_MAGIC);
      if (!header || bytes.length !== HEADER_BYTES + KEY_BYTES + TAG_BYTES) {
        return { ok: false, reason: "invalid-ciphertext" };
      }
      const privateBytes = requestKeyPair.privateKey.slice();
      const publicBytes = requestKeyPair.publicKey.bytes.slice();
      const info = grantInfo(context);
      try {
        const recipientPrivate = await suite.kem.deserializePrivateKey(privateBytes);
        const opened = new Uint8Array(
          await suite.open(
            { recipientKey: recipientPrivate, enc: header.subarray(GRANT_MAGIC.length), info },
            bytes.subarray(HEADER_BYTES),
            join(info, GRANT_MAGIC, publicBytes),
          ),
        );
        if (!validKey(opened)) {
          opened.fill(0);
          return { ok: false, reason: "context-mismatch" };
        }
        return success({ bytes: opened });
      } catch {
        return { ok: false, reason: "invalid-ciphertext" };
      } finally {
        privateBytes.fill(0);
      }
    },
  };
}
