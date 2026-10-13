import { describe, expect, it } from "vitest";
import type { OwnProfile } from "~/shared/api/own-profile.types";
import {
  isProfileDraftValid,
  profileDraft,
  profileDraftDisplayName,
  profilePatch,
} from "./user-profile-editor.lib";

const profile: OwnProfile = {
  uuid: "user",
  username: "alice",
  firstName: "Alice",
  lastName: "Smith",
  email: "alice@example.com",
  phone: null,
  description: "",
};
describe("profile draft", () => {
  it("keeps username readonly when clearing the name parts", () => {
    const baseline = profileDraft(profile);
    const draft = { ...baseline, firstName: "", lastName: "" };
    expect(profilePatch(baseline, draft)).toEqual({
      firstName: null,
      lastName: null,
    });
    expect(profileDraftDisplayName(draft)).toBe("alice");
    expect(profileDraftDisplayName(baseline)).toBe("Alice Smith");
  });
  it.each([
    ["", "", "alice"],
    [" Alice ", "", "Alice"],
    ["", " Smith ", "Smith"],
    [" Alice ", " Smith ", "Alice Smith"],
    [" ", " ", "alice"],
  ])("previews optional names (%s, %s) as %s", (firstName, lastName, expected) => {
    const draft = { ...profileDraft(profile), firstName, lastName };
    expect(profileDraftDisplayName(draft)).toBe(expected);
    expect(isProfileDraftValid(draft)).toBe(true);
  });

  it("uses the saved username after clearing both names and normalizes editable fields", () => {
    const baseline = profileDraft(profile);
    const draft = {
      ...baseline,
      firstName: " ",
      lastName: " ",
      phone: " +123 ",
      description: " About me ",
    };
    expect(profileDraftDisplayName(draft)).toBe("alice");
    expect(profilePatch(baseline, draft)).toEqual({
      firstName: null,
      lastName: null,
      phone: "+123",
      description: " About me ",
    });
    expect(profilePatch(baseline, { ...baseline, username: "changed-username" })).toEqual({});
  });

  it("does not revalidate a readonly username when saving editable fields", () => {
    const baseline = profileDraft({ ...profile, username: "legacy@example.com" });
    const draft = { ...baseline, firstName: "Updated" };
    expect(isProfileDraftValid(draft)).toBe(true);
    expect(profilePatch(baseline, draft)).toEqual({ firstName: "Updated" });
  });

  it.each([
    ["", true],
    ["😀".repeat(128), true],
    ["😀".repeat(129), false],
    ["Alice\nSmith", false],
    ["Alice\rSmith", true],
    ["Alice\u2028Smith", true],
  ])("matches optional IAM name validation for %j", (name, expected) => {
    const draft = profileDraft(profile);
    expect(isProfileDraftValid({ ...draft, firstName: name })).toBe(expected);
    expect(isProfileDraftValid({ ...draft, lastName: name })).toBe(expected);
  });

  it("validates supported editable field lengths", () => {
    const draft = profileDraft(profile);
    expect(isProfileDraftValid(draft)).toBe(true);
    expect(isProfileDraftValid({ ...draft, firstName: "A".repeat(129) })).toBe(false);
    expect(isProfileDraftValid({ ...draft, phone: "1".repeat(16) })).toBe(false);
  });
});
