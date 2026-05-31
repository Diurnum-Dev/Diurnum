import { describe, expect, it, vi } from "vitest";
import {
  checkGitHubReleaseUpdate,
  compareVersions,
} from "./githubReleases";

describe("github release updates", () => {
  it("compares semantic versions in release order", () => {
    expect(compareVersions("1.2.0", "1.1.9")).toBeGreaterThan(0);
    expect(compareVersions("1.2.0", "1.2.0")).toBe(0);
    expect(compareVersions("1.1.9", "1.2.0")).toBeLessThan(0);
    expect(compareVersions("1.2.0-beta.1", "1.2.0")).toBeLessThan(0);
  });

  it("reads GitHub release metadata and returns a newer release", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: "v1.2.3",
        html_url: "https://github.com/Diurnum-Dev/Diurnum/releases/tag/v1.2.3",
        published_at: "2026-05-31T12:00:00Z",
        body: "Release notes",
        assets: [
          {
            name: "Diurnum.dmg",
            browser_download_url: "https://example.com/Diurnum.dmg",
          },
        ],
      }),
    });

    await expect(checkGitHubReleaseUpdate("1.2.0", fetchMock)).resolves.toEqual({
      version: "1.2.3",
      releaseUrl: "https://github.com/Diurnum-Dev/Diurnum/releases/tag/v1.2.3",
      assetUrl: "https://example.com/Diurnum.dmg",
      publishedAt: "2026-05-31T12:00:00Z",
      notes: "Release notes",
    });
  });

  it("returns null when the release is not newer", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: "v0.1.0",
      }),
    });

    await expect(checkGitHubReleaseUpdate("0.1.0", fetchMock)).resolves.toBeNull();
  });
});
