import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseDotEnv(contents) {
  const env = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (!key) continue;
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function loadEnvFromFile(path) {
  if (!existsSync(path)) return {};
  try {
    return parseDotEnv(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

function resolveVar(key, fileEnv) {
  const processValue = process.env[key];
  const fileValue = fileEnv[key];
  if (!fileValue) return processValue;
  if (!processValue) return fileValue;

  // Shell-sourced .env may truncate "$..." fragments in password values.
  if (fileValue.includes("$") && !processValue.includes("$") && fileValue.startsWith(processValue)) {
    return fileValue;
  }
  return processValue;
}

function getArgValue(flag) {
  const args = process.argv.slice(2);
  const index = args.indexOf(flag);
  if (index < 0) return undefined;
  return args[index + 1];
}

function hasFlag(flag) {
  return process.argv.slice(2).includes(flag);
}

function normalizeRealm(realm) {
  return realm.replace(/\/+$/, "");
}

async function readJsonResponse(response, label) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const details = payload && typeof payload === "object" ? JSON.stringify(payload) : "no-body";
    throw new Error(`${label} failed: HTTP ${response.status} ${response.statusText} (${details})`);
  }

  if (
    payload &&
    typeof payload === "object" &&
    "result" in payload &&
    payload.result === "error"
  ) {
    const message =
      typeof payload.msg === "string" ? payload.msg : `${label} returned Zulip error result`;
    throw new Error(message);
  }

  return payload;
}

async function fetchApiKey({ realm, email, password }) {
  const response = await fetch(`${realm}/api/v1/fetch_api_key`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      username: email,
      password,
    }).toString(),
  });

  const payload = await readJsonResponse(response, "fetch_api_key");
  const apiKey = typeof payload?.api_key === "string" ? payload.api_key : null;
  if (!apiKey) {
    throw new Error("fetch_api_key response does not contain api_key");
  }
  return apiKey;
}

function buildAuthHeader(email, apiKey) {
  const token = Buffer.from(`${email}:${apiKey}`).toString("base64");
  return `Basic ${token}`;
}

function selectStream(subscriptions, streamHint) {
  if (!Array.isArray(subscriptions) || subscriptions.length === 0) return null;
  if (!streamHint) {
    return (
      subscriptions.find(
        (subscription) => typeof subscription?.name === "string" && subscription.name === "general",
      ) ?? subscriptions[0]
    );
  }

  const numericId = Number(streamHint);
  if (Number.isInteger(numericId) && numericId > 0) {
    return subscriptions.find((subscription) => subscription?.stream_id === numericId) ?? null;
  }

  return (
    subscriptions.find(
      (subscription) =>
        typeof subscription?.name === "string" &&
        subscription.name.toLowerCase() === streamHint.toLowerCase(),
    ) ?? null
  );
}

async function main() {
  if (hasFlag("--help")) {
    console.log("Usage: node scripts/seed-feed-message.mjs [--stream <name|id>] [--topic <topic>] [--content <text>]");
    console.log("Reads TEST_USER_ZULIP_SERVER / TEST_USER_EMAIL / TEST_USER_PASSWORD from packages/web/.env.");
    return;
  }

  const envPath = resolve(process.cwd(), "packages/web/.env");
  const fileEnv = loadEnvFromFile(envPath);

  const realmRaw = resolveVar("TEST_USER_ZULIP_SERVER", fileEnv);
  const email = resolveVar("TEST_USER_EMAIL", fileEnv);
  const password = resolveVar("TEST_USER_PASSWORD", fileEnv);

  if (!realmRaw || !email || !password) {
    throw new Error(
      "Missing TEST_USER_* credentials. Expected TEST_USER_ZULIP_SERVER, TEST_USER_EMAIL, TEST_USER_PASSWORD in packages/web/.env or process env.",
    );
  }

  const realm = normalizeRealm(realmRaw);
  const streamHint = getArgValue("--stream");
  const topic = getArgValue("--topic") ?? "migration-feed-seed";
  const explicitContent = getArgValue("--content");
  const content =
    explicitContent ??
    `[R10-24 feed seed] ${new Date().toISOString()} :: deterministic message for feed smoke`;

  const apiKey = await fetchApiKey({ realm, email, password });
  const authorization = buildAuthHeader(email, apiKey);

  const subscriptionsResponse = await fetch(`${realm}/api/v1/users/me/subscriptions`, {
    method: "GET",
    headers: {
      Authorization: authorization,
    },
  });
  const subscriptionsPayload = await readJsonResponse(
    subscriptionsResponse,
    "users/me/subscriptions",
  );
  const subscriptions = Array.isArray(subscriptionsPayload?.subscriptions)
    ? subscriptionsPayload.subscriptions
    : [];

  const stream = selectStream(subscriptions, streamHint);
  if (!stream || typeof stream.stream_id !== "number" || typeof stream.name !== "string") {
    if (streamHint) {
      throw new Error(`Could not resolve stream from --stream "${streamHint}"`);
    }
    throw new Error("No subscribed streams available for the provided test account");
  }

  const sendResponse = await fetch(`${realm}/api/v1/messages`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      type: "stream",
      to: String(stream.stream_id),
      topic,
      content,
    }).toString(),
  });
  const sendPayload = await readJsonResponse(sendResponse, "messages send");
  const messageId = typeof sendPayload?.id === "number" ? sendPayload.id : null;

  console.log(
    `[seed-feed] Sent message${messageId == null ? "" : ` #${messageId}`} to stream "${stream.name}" (id=${stream.stream_id}) in topic "${topic}".`,
  );
  console.log("[seed-feed] Open /feed and verify at least one message row is visible.");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[seed-feed] Failed: ${message}`);
  process.exitCode = 1;
});
