import { describe, expect, it } from "vitest";
import { t } from "~/i18n/i18n";
import { isComposerDisabled, resolveComposerPlaceholder } from "./chat-page-composer-section.lib";

const PEER_UUID = "5d4ad324-de78-49ac-9759-ed3d0758fa16";

describe("chat-page-composer-section.lib", () => {
  describe("isComposerDisabled", () => {
    it("enables composer for DM with IAM UUID peer id", () => {
      expect(
        isComposerDisabled({
          dmPartnerDeactivated: false,
          isDmView: true,
          activeStreamUuid: PEER_UUID,
          activeStream: undefined,
        }),
      ).toBe(false);
    });

    it("disables composer when DM stream uuid is missing", () => {
      expect(
        isComposerDisabled({
          dmPartnerDeactivated: false,
          isDmView: true,
          activeStreamUuid: null,
          activeStream: undefined,
        }),
      ).toBe(true);
    });

    it("enables composer for stream-backed DM without peer ids", () => {
      expect(
        isComposerDisabled({
          dmPartnerDeactivated: false,
          isDmView: true,
          activeStreamUuid: "22222222-2222-4222-8222-222222222222",
          activeStream: undefined,
        }),
      ).toBe(false);
    });

    it("disables composer when DM partner is deactivated", () => {
      expect(
        isComposerDisabled({
          dmPartnerDeactivated: true,
          isDmView: true,
          activeStreamUuid: PEER_UUID,
          activeStream: undefined,
        }),
      ).toBe(true);
    });
  });

  describe("resolveComposerPlaceholder", () => {
    it("uses send placeholder for DM with IAM UUID peer id", () => {
      expect(
        resolveComposerPlaceholder({
          dmPartnerDeactivated: false,
          isDmView: true,
          activeStreamUuid: PEER_UUID,
          activeStream: undefined,
        }),
      ).toBe(t("chat.sendPlaceholder"));
    });
  });
});
