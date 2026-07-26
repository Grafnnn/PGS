import { describe, expect, it } from "vitest";
import { isStandaloneAppSurface } from "@/components/app-nav-routes";
import { readSidebarPreference, SIDEBAR_STORAGE_KEY, writeSidebarPreference } from "@/components/app-nav-state";

function createMemoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial) values.set(SIDEBAR_STORAGE_KEY, initial);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    }
  };
}

describe("sidebar preference helpers", () => {
  it("reads only supported sidebar states", () => {
    expect(readSidebarPreference(createMemoryStorage("expanded"))).toBe("expanded");
    expect(readSidebarPreference(createMemoryStorage("collapsed"))).toBe("collapsed");
    expect(readSidebarPreference(createMemoryStorage("wide"))).toBeNull();
  });

  it("returns null when storage is unavailable or throws", () => {
    expect(readSidebarPreference(null)).toBeNull();
    expect(
      readSidebarPreference({
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => undefined
      })
    ).toBeNull();
  });

  it("writes the selected state without throwing when persistence is blocked", () => {
    const storage = createMemoryStorage();
    writeSidebarPreference(storage, "collapsed");
    expect(readSidebarPreference(storage)).toBe("collapsed");

    expect(() =>
      writeSidebarPreference(
        {
          getItem: () => null,
          setItem: () => {
            throw new Error("blocked");
          }
        },
        "expanded"
      )
    ).not.toThrow();
  });
});

describe("app navigation surface", () => {
  it("keeps authentication and external response pages outside the project shell", () => {
    expect(isStandaloneAppSurface("/login")).toBe(true);
    expect(isStandaloneAppSurface("/reset-password")).toBe(true);
    expect(isStandaloneAppSurface("/invite/accept")).toBe(true);
    expect(isStandaloneAppSurface("/external/respond/one-time-token")).toBe(true);
  });

  it("keeps application workspaces inside the project shell", () => {
    expect(isStandaloneAppSurface("/dashboard")).toBe(false);
    expect(isStandaloneAppSurface("/projects/project-1")).toBe(false);
    expect(isStandaloneAppSurface("/external")).toBe(false);
  });
});
