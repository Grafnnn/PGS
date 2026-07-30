import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { isStandaloneAppSurface } from "@/components/app-nav-routes";
import {
  APP_NAVIGATION_ITEMS,
  filterNavigationItems,
  isNavigationItemActive,
  readSidebarPreference,
  SIDEBAR_STORAGE_KEY,
  writeSidebarPreference
} from "@/components/app-nav-state";

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

describe("app navigation model", () => {
  it("uses unique real destinations instead of duplicate project placeholders", () => {
    const hrefs = APP_NAVIGATION_ITEMS.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).toEqual([
      "/dashboard",
      "/inbox",
      "/portfolio",
      "/projects",
      "/admin/users",
      "/admin/integrations"
    ]);
  });

  it("finds the project workspace by module names", () => {
    expect(filterNavigationItems(APP_NAVIGATION_ITEMS, "материалы").map((item) => item.id)).toEqual(["projects"]);
    expect(filterNavigationItems(APP_NAVIGATION_ITEMS, "cash-flow").map((item) => item.id)).toEqual(["projects"]);
    expect(filterNavigationItems(APP_NAVIGATION_ITEMS, "роли доступ").map((item) => item.id)).toEqual(["users"]);
  });

  it("keeps active state scoped to the matching route", () => {
    const projects = APP_NAVIGATION_ITEMS.find((item) => item.id === "projects");
    const users = APP_NAVIGATION_ITEMS.find((item) => item.id === "users");
    expect(projects && isNavigationItemActive("/projects/project-smoke", projects)).toBe(true);
    expect(users && isNavigationItemActive("/admin/integrations", users)).toBe(false);
  });

  it("renders one shared navigation instance for desktop and mobile", () => {
    const source = fs.readFileSync(new URL("./app-nav.tsx", import.meta.url), "utf8");
    expect(source.match(/<NavigationLinks/g)).toHaveLength(1);
    expect(source).not.toContain("mobile-drawer");
  });
});
