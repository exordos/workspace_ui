import assert from "node:assert/strict";
import test from "node:test";

import { resolveNotarizationCredentials } from "./notarize.mjs";

test("returns undefined when notarization credentials are absent", () => {
  assert.equal(resolveNotarizationCredentials({}), undefined);
});

test("resolves App Store Connect API credentials", () => {
  assert.deepEqual(
    resolveNotarizationCredentials({
      APPLE_API_KEY: "/tmp/AuthKey_TEST.p8",
      APPLE_API_KEY_ID: "TESTKEY123",
      APPLE_API_ISSUER: "00000000-0000-0000-0000-000000000000",
    }),
    {
      appleApiKey: "/tmp/AuthKey_TEST.p8",
      appleApiKeyId: "TESTKEY123",
      appleApiIssuer: "00000000-0000-0000-0000-000000000000",
    },
  );
});

test("rejects a partial App Store Connect credential set", () => {
  assert.throws(
    () =>
      resolveNotarizationCredentials({
        APPLE_API_KEY: "/tmp/AuthKey_TEST.p8",
        APPLE_API_KEY_ID: "TESTKEY123",
      }),
    /must be configured together/,
  );
});

test("keeps Apple ID notarization available for local builds", () => {
  assert.deepEqual(
    resolveNotarizationCredentials({
      APPLE_ID: "developer@example.com",
      APPLE_APP_SPECIFIC_PASSWORD: "example-password",
      APPLE_TEAM_ID: "TEAM123456",
    }),
    {
      appleId: "developer@example.com",
      appleIdPassword: "example-password",
      teamId: "TEAM123456",
    },
  );
});

test("rejects ambiguous notarization credential sets", () => {
  assert.throws(
    () =>
      resolveNotarizationCredentials({
        APPLE_API_KEY: "/tmp/AuthKey_TEST.p8",
        APPLE_API_KEY_ID: "TESTKEY123",
        APPLE_API_ISSUER: "00000000-0000-0000-0000-000000000000",
        APPLE_ID: "developer@example.com",
        APPLE_APP_SPECIFIC_PASSWORD: "example-password",
        APPLE_TEAM_ID: "TEAM123456",
      }),
    /not both/,
  );
});
