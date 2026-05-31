import { beforeEach, describe, expect, it } from "vitest";
import { loadUpdatePrefs, resetUpdatePrefsStorage, saveUpdatePrefs } from "./updatePreferences";

describe("update preferences", () => {
  beforeEach(() => {
    resetUpdatePrefsStorage();
  });

  it("defaults to checking for updates on launch", () => {
    expect(loadUpdatePrefs()).toEqual({
      checkOnLaunch: true,
      lastCheckedAt: null,
    });
  });

  it("persists update preferences to local storage", () => {
    saveUpdatePrefs({
      checkOnLaunch: false,
      lastCheckedAt: "2026-05-31T12:00:00Z",
    });

    expect(loadUpdatePrefs()).toEqual({
      checkOnLaunch: false,
      lastCheckedAt: "2026-05-31T12:00:00Z",
    });
  });
});
