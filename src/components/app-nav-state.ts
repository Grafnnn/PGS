export type SidebarPreference = "expanded" | "collapsed";

export const SIDEBAR_STORAGE_KEY = "pgs.sidebar.state";

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export function normalizeSidebarPreference(value: string | null): SidebarPreference | null {
  return value === "expanded" || value === "collapsed" ? value : null;
}

export function readSidebarPreference(storage?: StorageLike | null): SidebarPreference | null {
  if (!storage) return null;
  try {
    return normalizeSidebarPreference(storage.getItem(SIDEBAR_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeSidebarPreference(storage: StorageLike | undefined | null, value: SidebarPreference) {
  if (!storage) return;
  try {
    storage.setItem(SIDEBAR_STORAGE_KEY, value);
  } catch {
    // Navigation should keep working even when browser persistence is blocked.
  }
}
