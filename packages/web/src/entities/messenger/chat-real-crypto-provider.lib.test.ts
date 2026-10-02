import { Chacha20Poly1305 } from "@hpke/chacha20poly1305";
import { CipherSuite, HkdfSha256 } from "@hpke/core";
import { DhkemX25519HkdfSha256 } from "@hpke/dhkem-x25519";
import { chacha20poly1305 } from "@noble/ciphers/chacha.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { describe, expect, it, vi } from "vitest";
import { createRealChatCryptoProvider } from "./chat-real-crypto-provider.lib";
import type { ChatCryptoResult } from "./chat-crypto-provider.types";

const encoder = new TextEncoder();
const context = { streamUuid: "chat-a", keyUuid: "generation-a" };
const grantContext = {
  ...context,
  requestMessageUuid: "request-a",
  senderDeviceId: "issuer",
  recipientDeviceId: "requester",
};

function hex(value: string): Uint8Array {
  return Uint8Array.from(value.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16));
}

function unwrap<T>(result: ChatCryptoResult<T>): T {
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}

describe("real chat cryptography", () => {
  it("matches the independent RFC 8439 section 2.8.2 AEAD vector", () => {
    const key = hex("808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f");
    const nonce = hex("070000004041424344454647");
    const aad = hex("50515253c0c1c2c3c4c5c6c7");
    const plaintext = encoder.encode(
      "Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.",
    );
    const expected = hex(
      "d31a8d34648e60db7b86afbc53ef7ec2a4aded51296e08fea9e2b5a736ee62d6" +
        "3dbea45e8ca9671282fafb69da92728b1a71de0a9e060b2905d6a5b67ecd3b36" +
        "92ddbd7f2d778b8c9803aee328091b58fab324e4fad675945585808b4831d7bc3" +
        "ff4def08e4b7a9de576d26586cec64b61161ae10b594f09e26a7e902ecbd0600691",
    );
    expect(chacha20poly1305(key, nonce, aad).encrypt(plaintext)).toEqual(expected);
    expect(Array.from(chacha20poly1305(key, nonce, aad).decrypt(expected))).toEqual(
      Array.from(plaintext),
    );
  });

  it("matches RFC 9180 A.2.1 base setup and ciphertext in both directions", async () => {
    const suite = new CipherSuite({
      kem: new DhkemX25519HkdfSha256(),
      kdf: new HkdfSha256(),
      aead: new Chacha20Poly1305(),
    });
    const info = hex("4f6465206f6e2061204772656369616e2055726e");
    const publicKey = await suite.kem.deserializePublicKey(
      hex("4310ee97d88cc1f088a5576c77ab0cf5c3ac797f3d95139c6c84b5429c59662a"),
    );
    const privateKey = await suite.kem.deserializePrivateKey(
      hex("8057991eef8f1f1af18f4a9491d16a1ce333f695d4db8e38da75975c4478e0fb"),
    );
    const ikmE = hex("909a9b35d3dc4713a5e72a4da274b55d3d3821a37e5d099e74a647db583a904b");
    const enc = hex("1afa08d3dec047a643885163f1180476fa7ddb54c6a8029ea33f95796bf2ac4a");
    const plaintext = hex("4265617574792069732074727574682c20747275746820626561757479");
    const aad = hex("436f756e742d30");
    const ciphertext = hex(
      "1c5250d8034ec2b784ba2cfd69dbdb8af406cfe3ff938e131f0def8c8b60b4db21993c62ce81883d2dd1b51a28",
    );
    const sealed = await suite.seal(
      { recipientPublicKey: publicKey, info, ekm: ikmE },
      plaintext,
      aad,
    );
    expect(new Uint8Array(sealed.enc)).toEqual(enc);
    expect(new Uint8Array(sealed.ct)).toEqual(ciphertext);
    expect(
      new Uint8Array(await suite.open({ recipientKey: privateKey, enc, info }, ciphertext, aad)),
    ).toEqual(plaintext);
  });

  it("matches RFC 5869 A.1 HKDF-SHA256 derivation", () => {
    expect(
      hkdf(
        sha256,
        new Uint8Array(22).fill(11),
        hex("000102030405060708090a0b0c"),
        hex("f0f1f2f3f4f5f6f7f8f9"),
        42,
      ),
    ).toEqual(
      hex("3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865"),
    );
  });

  it("generates fresh group keys and serializable request pairs", async () => {
    const provider = createRealChatCryptoProvider();
    const first = unwrap(await provider.createGroupKey());
    const second = unwrap(await provider.createGroupKey());
    expect(first.bytes).toHaveLength(32);
    expect(second.bytes).not.toEqual(first.bytes);
    const pair = unwrap(await provider.createRequestKeyPair());
    const nextPair = unwrap(await provider.createRequestKeyPair());
    expect(pair.publicKey.bytes).toHaveLength(32);
    expect(pair.privateKey).toHaveLength(32);
    expect(nextPair.publicKey.bytes).not.toEqual(pair.publicKey.bytes);
  });

  it("fails closed when secure randomness is unavailable", async () => {
    const provider = createRealChatCryptoProvider();
    const groupKey = unwrap(await provider.createGroupKey());
    const random = vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(() => {
      throw new Error("unavailable");
    });
    try {
      expect(await provider.createGroupKey()).toEqual({ ok: false, reason: "unavailable" });
      expect(
        await provider.encryptMessage({ groupKey, plaintext: encoder.encode("hello"), context }),
      ).toEqual({ ok: false, reason: "unavailable" });
    } finally {
      random.mockRestore();
    }
  });

  it("uses independent salts for simultaneous senders and survives provider recreation", async () => {
    const provider = createRealChatCryptoProvider();
    const groupKey = unwrap(await provider.createGroupKey());
    const plaintext = encoder.encode("Сообщение 👋");
    const envelopes = await Promise.all(
      Array.from({ length: 24 }, async () =>
        unwrap(await provider.encryptMessage({ groupKey, plaintext, context })),
      ),
    );
    expect(
      new Set(envelopes.map((envelope) => Array.from(envelope.bytes.slice(5, 37)).join(","))).size,
    ).toBe(24);
    expect(
      Array.from(
        unwrap(
          await createRealChatCryptoProvider().decryptMessage({
            groupKey,
            envelope: envelopes[0]!,
            context,
          }),
        ),
      ),
    ).toEqual(Array.from(plaintext));
    expect(new TextDecoder().decode(envelopes[0]!.bytes)).not.toContain("Сообщение");
  });

  it.each(["streamUuid", "keyUuid"] as const)(
    "rejects message substitution of %s",
    async (field) => {
      const provider = createRealChatCryptoProvider();
      const groupKey = unwrap(await provider.createGroupKey());
      const envelope = unwrap(
        await provider.encryptMessage({ groupKey, plaintext: encoder.encode("hello"), context }),
      );
      expect(
        await provider.decryptMessage({
          groupKey,
          envelope,
          context: { ...context, [field]: "other" },
        }),
      ).toEqual({ ok: false, reason: "invalid-ciphertext" });
    },
  );

  it("rejects tampering of magic, salt, ciphertext, tag and truncation", async () => {
    const provider = createRealChatCryptoProvider();
    const groupKey = unwrap(await provider.createGroupKey());
    const envelope = unwrap(
      await provider.encryptMessage({ groupKey, plaintext: encoder.encode("hello"), context }),
    );
    for (const offset of [0, 4, 5, 37, envelope.bytes.length - 1]) {
      const bytes = envelope.bytes.slice();
      bytes[offset] = bytes[offset]! ^ 1;
      expect((await provider.decryptMessage({ groupKey, envelope: { bytes }, context })).ok).toBe(
        false,
      );
    }
    expect(
      (
        await provider.decryptMessage({
          groupKey,
          envelope: { bytes: envelope.bytes.slice(0, 20) },
          context,
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await provider.decryptMessage({
          groupKey: unwrap(await provider.createGroupKey()),
          envelope,
          context,
        })
      ).ok,
    ).toBe(false);
  });

  it("delivers a group key to a persisted request pair and checks the announced fingerprint", async () => {
    const provider = createRealChatCryptoProvider();
    const groupKey = unwrap(await provider.createGroupKey());
    const requestKeyPair = unwrap(await provider.createRequestKeyPair());
    const expectedFingerprint = unwrap(
      await provider.fingerprintGroupKey(groupKey, context.keyUuid),
    );
    const envelope = unwrap(
      await provider.encryptGroupKeyGrant({
        groupKey,
        recipientPublicKey: requestKeyPair.publicKey,
        context: grantContext,
      }),
    );
    expect(envelope.bytes).toHaveLength(85);
    const reloaded = createRealChatCryptoProvider();
    expect(
      unwrap(
        await reloaded.decryptGroupKeyGrant({
          requestKeyPair: structuredClone(requestKeyPair),
          expectedFingerprint,
          envelope,
          context: grantContext,
        }),
      ),
    ).toEqual(groupKey);
    const wrongFingerprint = unwrap(
      await provider.fingerprintGroupKey(groupKey, "other-generation"),
    );
    expect(
      await reloaded.decryptGroupKeyGrant({
        requestKeyPair,
        expectedFingerprint: wrongFingerprint,
        envelope,
        context: grantContext,
      }),
    ).toEqual({ ok: false, reason: "context-mismatch" });
  });

  it.each([
    "streamUuid",
    "keyUuid",
    "requestMessageUuid",
    "senderDeviceId",
    "recipientDeviceId",
  ] as const)("binds grant %s", async (field) => {
    const provider = createRealChatCryptoProvider();
    const groupKey = unwrap(await provider.createGroupKey());
    const requestKeyPair = unwrap(await provider.createRequestKeyPair());
    const expectedFingerprint = unwrap(
      await provider.fingerprintGroupKey(groupKey, context.keyUuid),
    );
    const envelope = unwrap(
      await provider.encryptGroupKeyGrant({
        groupKey,
        recipientPublicKey: requestKeyPair.publicKey,
        context: grantContext,
      }),
    );
    expect(
      (
        await provider.decryptGroupKeyGrant({
          requestKeyPair,
          expectedFingerprint,
          envelope,
          context: { ...grantContext, [field]: "other" },
        })
      ).ok,
    ).toBe(false);
  });

  it("rejects another recipient, wrong operation envelope and malformed keys", async () => {
    const provider = createRealChatCryptoProvider();
    const groupKey = unwrap(await provider.createGroupKey());
    const requestKeyPair = unwrap(await provider.createRequestKeyPair());
    const otherPair = unwrap(await provider.createRequestKeyPair());
    const expectedFingerprint = unwrap(
      await provider.fingerprintGroupKey(groupKey, context.keyUuid),
    );
    const envelope = unwrap(
      await provider.encryptGroupKeyGrant({
        groupKey,
        recipientPublicKey: requestKeyPair.publicKey,
        context: grantContext,
      }),
    );
    expect(
      (
        await provider.decryptGroupKeyGrant({
          requestKeyPair: otherPair,
          expectedFingerprint,
          envelope,
          context: grantContext,
        })
      ).ok,
    ).toBe(false);
    expect((await provider.decryptMessage({ groupKey, envelope, context })).ok).toBe(false);
    expect(
      await provider.encryptMessage({
        groupKey: { bytes: new Uint8Array(31) },
        plaintext: new Uint8Array(),
        context,
      }),
    ).toEqual({ ok: false, reason: "invalid-key" });
    expect(
      await provider.encryptGroupKeyGrant({
        groupKey,
        recipientPublicKey: { bytes: new Uint8Array(32) },
        context: grantContext,
      }),
    ).toEqual({ ok: false, reason: "invalid-key" });
  });
});
