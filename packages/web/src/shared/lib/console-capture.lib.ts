/**
 * Patches console.* in development so raw console output appears in the in-app log buffer.
 */

import { appendBufferedLog, type LogLevel } from "./logger";

const CONSOLE_SCOPE = "console";
const MAX_SERIALIZED_ARGS = 8;
const MAX_ARG_STRING_LENGTH = 500;

type ConsoleMethod = "log" | "info" | "warn" | "error" | "debug";

const METHOD_TO_LEVEL: Record<ConsoleMethod, LogLevel> = {
  log: "info",
  info: "info",
  warn: "warn",
  error: "error",
  debug: "debug",
};

function serializeConsoleArg(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[max depth]";
  if (value == null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value.length > MAX_ARG_STRING_LENGTH
      ? `${value.slice(0, MAX_ARG_STRING_LENGTH)}…`
      : value;
  }
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof RegExp) {
    return value.toString();
  }
  if (value instanceof Set) {
    return Array.from(value)
      .slice(0, MAX_SERIALIZED_ARGS)
      .map((item) => serializeConsoleArg(item, depth + 1));
  }
  if (value instanceof Map) {
    return Array.from(value.entries())
      .slice(0, MAX_SERIALIZED_ARGS)
      .map(([key, nested]) => [
        serializeConsoleArg(key, depth + 1),
        serializeConsoleArg(nested, depth + 1),
      ]);
  }
  if (Array.isArray(value)) {
    return value.slice(0, MAX_SERIALIZED_ARGS).map((item) => serializeConsoleArg(item, depth + 1));
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    let count = 0;
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (count >= MAX_SERIALIZED_ARGS) {
        result["…"] = "[truncated]";
        break;
      }
      result[key] = serializeConsoleArg(nested, depth + 1);
      count += 1;
    }
    return result;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "symbol") {
    return value.description !== "" ? value.description : value.toString();
  }
  if (typeof value === "function") {
    return `[function ${value.name || "anonymous"}]`;
  }
  return "[unsupported]";
}

function serializeConsoleArgs(args: unknown[]): unknown[] {
  return args.slice(0, MAX_SERIALIZED_ARGS).map((arg) => serializeConsoleArg(arg));
}

function resolveConsoleMessage(args: unknown[]): string {
  const first = args[0];
  if (typeof first === "string" && first.length > 0) {
    return first.length > MAX_ARG_STRING_LENGTH
      ? `${first.slice(0, MAX_ARG_STRING_LENGTH)}…`
      : first;
  }
  return "[console]";
}

let installed = false;
const originals: Partial<Record<ConsoleMethod, (...args: unknown[]) => void>> = {};

export function initConsoleCapture(): () => void {
  if (installed || typeof console === "undefined") {
    return () => {};
  }
  installed = true;

  const methods: ConsoleMethod[] = ["log", "info", "warn", "error", "debug"];
  /* eslint-disable no-console -- patch console.* so output is mirrored to the diagnostics ring buffer */
  for (const method of methods) {
    originals[method] = console[method].bind(console);
    console[method] = (...args: unknown[]) => {
      appendBufferedLog(METHOD_TO_LEVEL[method], CONSOLE_SCOPE, resolveConsoleMessage(args), {
        args: serializeConsoleArgs(args),
      });
      originals[method]?.(...args);
    };
  }
  /* eslint-enable no-console */

  return () => {
    /* eslint-disable no-console -- restore patched console methods */
    for (const method of methods) {
      if (originals[method]) {
        console[method] = originals[method];
      }
    }
    /* eslint-enable no-console */
    installed = false;
    for (const key of methods) {
      delete originals[key];
    }
  };
}
