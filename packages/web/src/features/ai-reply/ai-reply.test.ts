/**
 * Tests for the AI reply feature — smart replies, rewrite, translate,
 * summarize, and tone adjustment powered by a pluggable provider.
 *
 * Covers the Zustand store (generate, accept, dismiss, abort, clear),
 * the mock provider (used in dev/test), streaming output, and the HTTP
 * provider factory. The provider pattern decouples the UI from the backend.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createMockProvider } from "./ai-reply.api";
import { useAiReplyStore, setAiReplyProvider } from "./ai-reply.model";
import type { AiMessageContext } from "./ai-reply.types";

const MOCK_MESSAGES: AiMessageContext[] = [
  {
    id: 1,
    senderId: 10,
    senderName: "Alice",
    content: "How does this work?",
    timestamp: 1000,
    isOwn: false,
  },
  {
    id: 2,
    senderId: 20,
    senderName: "Bob",
    content: "Let me explain...",
    timestamp: 1001,
    isOwn: true,
  },
];

// Store lifecycle: idle → loading → done/error, plus accept, dismiss, and abort flows.
describe("AI Reply Store", () => {
  afterEach(() => {
    useAiReplyStore.getState().clear();
  });

  // Initial state must be clean so the UI doesn't show stale suggestions.
  it("starts idle with no suggestions", () => {
    const state = useAiReplyStore.getState();
    expect(state.status).toBe("idle");
    expect(state.suggestions).toHaveLength(0);
    expect(state.streamingText).toBe("");
    expect(state.error).toBeNull();
  });

  // Without a provider, generate must fail gracefully with an error message.
  it("sets error when no provider configured", async () => {
    await useAiReplyStore.getState().generate({
      action: "smart-reply",
      messages: MOCK_MESSAGES,
    });
    expect(useAiReplyStore.getState().status).toBe("error");
    expect(useAiReplyStore.getState().error).toContain("not configured");
  });

  // Smart reply: given conversation context, produce multiple reply suggestions.
  it("generates smart replies with mock provider", async () => {
    setAiReplyProvider(createMockProvider());
    await useAiReplyStore.getState().generate({
      action: "smart-reply",
      messages: MOCK_MESSAGES,
    });
    const state = useAiReplyStore.getState();
    expect(state.status).toBe("done");
    expect(state.suggestions.length).toBeGreaterThan(0);
    expect(state.suggestions[0]!.action).toBe("smart-reply");
  });

  // Rewrite: rephrase an existing draft while preserving meaning.
  it("generates rewrite with non-streaming provider", async () => {
    const mock = createMockProvider();
    setAiReplyProvider({ ...mock, generateStream: undefined });
    await useAiReplyStore.getState().generate({
      action: "rewrite",
      messages: [],
      draft: "hello world",
    });
    const state = useAiReplyStore.getState();
    expect(state.status).toBe("done");
    expect(state.suggestions).toHaveLength(1);
    expect(state.suggestions[0]!.text.toLowerCase()).toContain("hello");
  });

  // Translate: convert draft to a target language.
  it("generates translate with non-streaming provider", async () => {
    const mock = createMockProvider();
    setAiReplyProvider({ ...mock, generateStream: undefined });
    await useAiReplyStore.getState().generate({
      action: "translate",
      messages: [],
      draft: "test message",
      targetLanguage: "de",
    });
    const state = useAiReplyStore.getState();
    expect(state.status).toBe("done");
    expect(state.suggestions[0]!.text).toContain("de");
  });

  // Summarize: condense a conversation into a short summary.
  it("generates summarize with non-streaming provider", async () => {
    const mock = createMockProvider();
    setAiReplyProvider({ ...mock, generateStream: undefined });
    await useAiReplyStore.getState().generate({
      action: "summarize",
      messages: MOCK_MESSAGES,
    });
    const state = useAiReplyStore.getState();
    expect(state.status).toBe("done");
    expect(state.suggestions[0]!.text).toContain("Summary");
  });

  // Change-tone: adjust formality level (e.g. casual → formal).
  it("generates change-tone with non-streaming provider", async () => {
    const mock = createMockProvider();
    setAiReplyProvider({ ...mock, generateStream: undefined });
    await useAiReplyStore.getState().generate({
      action: "change-tone",
      messages: [],
      draft: "hi there",
      tone: "formal",
    });
    const state = useAiReplyStore.getState();
    expect(state.status).toBe("done");
    expect(state.suggestions[0]!.text).toContain("formal");
  });

  // Accepting a suggestion inserts its text into the composer and resets state.
  it("acceptSuggestion returns text and clears state", async () => {
    setAiReplyProvider(createMockProvider());
    await useAiReplyStore.getState().generate({
      action: "smart-reply",
      messages: MOCK_MESSAGES,
    });
    const id = useAiReplyStore.getState().suggestions[0]!.id;
    const text = useAiReplyStore.getState().acceptSuggestion(id);
    expect(text).toBeTruthy();
    expect(useAiReplyStore.getState().status).toBe("idle");
    expect(useAiReplyStore.getState().suggestions).toHaveLength(0);
  });

  // Unknown suggestion ID (e.g. stale reference) must return null.
  it("acceptSuggestion returns null for unknown id", () => {
    expect(useAiReplyStore.getState().acceptSuggestion("nonexistent")).toBeNull();
  });

  // Dismiss hides the AI panel — must reset all state to idle.
  it("dismiss clears everything", async () => {
    setAiReplyProvider(createMockProvider());
    await useAiReplyStore.getState().generate({ action: "smart-reply", messages: MOCK_MESSAGES });
    useAiReplyStore.getState().dismiss();
    expect(useAiReplyStore.getState().status).toBe("idle");
    expect(useAiReplyStore.getState().suggestions).toHaveLength(0);
  });

  // Abort cancels an in-progress generation (e.g. user clicks cancel).
  it("abort stops generation", () => {
    setAiReplyProvider(createMockProvider());
    useAiReplyStore.setState({ status: "loading" });
    useAiReplyStore.getState().abort();
    expect(useAiReplyStore.getState().status).toBe("idle");
  });

  // Clear is a full reset — used on context switch or logout.
  it("clear resets all state including lastAction", async () => {
    setAiReplyProvider(createMockProvider());
    await useAiReplyStore.getState().generate({ action: "smart-reply", messages: MOCK_MESSAGES });
    useAiReplyStore.getState().clear();
    expect(useAiReplyStore.getState().lastAction).toBeNull();
  });
});

// Mock provider is the dev/test implementation — must satisfy the AiReplyProvider contract.
describe("Mock Provider", () => {
  // Must expose all required methods and report as available.
  it("returns provider with correct interface", () => {
    const provider = createMockProvider();
    expect(provider.name).toBe("mock");
    expect(typeof provider.isAvailable).toBe("function");
    expect(typeof provider.generate).toBe("function");
    expect(typeof provider.generateStream).toBe("function");
    expect(provider.isAvailable()).toBe(true);
  });

  // Mock must detect question-like messages and produce relevant replies.
  it("smart-reply categorizes questions", async () => {
    const provider = createMockProvider();
    const result = await provider.generate({
      action: "smart-reply",
      messages: [
        {
          id: 1,
          senderId: 1,
          senderName: "A",
          content: "What time is the meeting?",
          timestamp: 0,
          isOwn: false,
        },
      ],
    });
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  // Greeting messages should produce greeting-like replies.
  it("smart-reply categorizes greetings", async () => {
    const provider = createMockProvider();
    const result = await provider.generate({
      action: "smart-reply",
      messages: [
        {
          id: 1,
          senderId: 1,
          senderName: "A",
          content: "Hi everyone!",
          timestamp: 0,
          isOwn: false,
        },
      ],
    });
    expect(
      result.suggestions.some((s) => s.text.toLowerCase().includes("hi") || s.text.includes("👋")),
    ).toBe(true);
  });

  // Streaming must deliver chunks incrementally and signal done at the end.
  it("streaming produces incremental output", async () => {
    const provider = createMockProvider();
    const chunks: string[] = [];
    let isDone = false;

    const abort = await provider.generateStream!(
      { action: "generate-reply", messages: MOCK_MESSAGES },
      (chunk) => {
        chunks.push(chunk.delta);
        if (chunk.done) isDone = true;
      },
    );

    await new Promise<void>((r) => {
      setTimeout(r, 3000);
    });
    expect(chunks.length).toBeGreaterThan(0);
    expect(isDone).toBe(true);

    abort();
  }, 5000);
});

// HTTP provider is the production implementation that calls a remote AI service.
describe("HTTP Provider", () => {
  // Factory must produce a valid provider with the correct name.
  it("is exported and creates a provider", async () => {
    const { createHttpProvider } = await import("./ai-reply.api");
    const provider = createHttpProvider("https://api.example.com");
    expect(provider.name).toBe("http");
    expect(provider.isAvailable()).toBe(true);
  });
});
