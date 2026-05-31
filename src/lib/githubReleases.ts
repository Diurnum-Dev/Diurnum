const GITHUB_RELEASES_LATEST_URL = "https://api.github.com/repos/Diurnum-Dev/Diurnum/releases/latest";

export type GitHubReleaseUpdate = {
  version: string;
  releaseUrl: string;
  assetUrl: string | null;
  publishedAt: string | null;
  notes: string | null;
};

type GitHubReleasePayload = {
  tag_name?: string;
  html_url?: string;
  published_at?: string | null;
  body?: string | null;
  assets?: Array<{
    name?: string;
    browser_download_url?: string;
  }>;
};

export async function checkGitHubReleaseUpdate(
  currentVersion: string,
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<GitHubReleaseUpdate | null> {
  const response = await fetchImpl(GITHUB_RELEASES_LATEST_URL, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": `Diurnum version ${currentVersion}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  const release = (await response.json()) as GitHubReleasePayload;
  const latestVersion = normalizeVersion(release.tag_name ?? "");
  if (!latestVersion) {
    return null;
  }
  if (compareVersions(latestVersion, currentVersion) <= 0) {
    return null;
  }

  const asset = release.assets?.find((candidate) => candidate.name?.endsWith(".dmg")) ?? null;

  return {
    version: latestVersion,
    releaseUrl:
      release.html_url ?? `https://github.com/Diurnum-Dev/Diurnum/releases/tag/v${latestVersion}`,
    assetUrl: asset?.browser_download_url ?? null,
    publishedAt: release.published_at ?? null,
    notes: release.body ?? null,
  };
}

export function compareVersions(left: string, right: string): number {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  if (!leftParts || !rightParts) {
    return 0;
  }

  for (let index = 0; index < leftParts.numbers.length; index += 1) {
    const difference = leftParts.numbers[index] - rightParts.numbers[index];
    if (difference !== 0) {
      return difference;
    }
  }

  if (leftParts.prerelease && !rightParts.prerelease) {
    return -1;
  }
  if (!leftParts.prerelease && rightParts.prerelease) {
    return 1;
  }
  if (leftParts.prerelease && rightParts.prerelease) {
    return leftParts.prerelease.localeCompare(rightParts.prerelease);
  }
  return 0;
}

function normalizeVersion(input: string): string | null {
  const version = input.trim().replace(/^v/i, "");
  return parseVersion(version) ? version : null;
}

function parseVersion(version: string): { numbers: [number, number, number]; prerelease: string | null } | null {
  const match = version.trim().replace(/^v/i, "").match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) {
    return null;
  }

  return {
    numbers: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] ?? null,
  };
}
