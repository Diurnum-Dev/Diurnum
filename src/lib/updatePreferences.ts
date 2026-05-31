const UPDATE_PREFS_KEY = "diurnum.settings.v1";
const fallbackStorage = new Map<string, string>();

export type UpdatePrefs = {
  checkOnLaunch: boolean;
  lastCheckedAt: string | null;
};

export function loadUpdatePrefs(): UpdatePrefs {
  try {
    const raw = readUpdatePrefValue();
    if (!raw) {
      return { checkOnLaunch: true, lastCheckedAt: null };
    }
    const parsed = JSON.parse(raw) as { checkOnLaunch?: boolean; lastCheckedAt?: string | null };
    return {
      checkOnLaunch: parsed.checkOnLaunch !== false,
      lastCheckedAt: typeof parsed.lastCheckedAt === "string" ? parsed.lastCheckedAt : null,
    };
  } catch {
    return { checkOnLaunch: true, lastCheckedAt: null };
  }
}

export function saveUpdatePrefs(prefs: UpdatePrefs) {
  writeUpdatePrefValue(JSON.stringify(prefs));
}

export function resetUpdatePrefsStorage() {
  fallbackStorage.clear();
}

function readUpdatePrefValue(): string | null {
  const storage = window.localStorage as Partial<Storage> | undefined;
  if (storage && typeof storage.getItem === "function") {
    return storage.getItem(UPDATE_PREFS_KEY);
  }
  return fallbackStorage.get(UPDATE_PREFS_KEY) ?? null;
}

function writeUpdatePrefValue(value: string) {
  const storage = window.localStorage as Partial<Storage> | undefined;
  if (storage && typeof storage.setItem === "function") {
    storage.setItem(UPDATE_PREFS_KEY, value);
    return;
  }
  fallbackStorage.set(UPDATE_PREFS_KEY, value);
}
