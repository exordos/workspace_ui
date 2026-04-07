import { describe, expect, it } from "vitest";
import {
  TOPIC_PROMPT_BUTTON_CLASS_NAME,
  TOPIC_PROMPT_ICON_HOVER_MODE,
} from "./chat-topic-prompt-button.lib";

describe("chat topic prompt button styles", () => {
  it("keeps the prompt button explicitly flat without rounded corners", () => {
    expect(TOPIC_PROMPT_BUTTON_CLASS_NAME).toContain("!rounded-none");
    expect(TOPIC_PROMPT_BUTTON_CLASS_NAME).toContain("border-t");
    expect(TOPIC_PROMPT_BUTTON_CLASS_NAME).not.toContain("rounded-lg");
  });

  it("opts out from global icon-only button hover preset", () => {
    expect(TOPIC_PROMPT_ICON_HOVER_MODE).toBe("custom");
  });
});
