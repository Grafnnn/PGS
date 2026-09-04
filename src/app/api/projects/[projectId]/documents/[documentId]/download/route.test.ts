import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  canProject: vi.fn(),
  findFirst: vi.fn(),
  read: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: mocks.canProject }));
vi.mock("@/lib/storage/documents", () => ({ readDocumentFile: mocks.read }));
vi.mock("@/lib/prisma", () => ({ prisma: { document: { findFirst: mocks.findFirst } } }));

const context = { params: { projectId: "project-1", documentId: "document-1" } };

describe("document download route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ id: "user-1", authenticated: true });
    mocks.canProject.mockResolvedValue(true);
    mocks.findFirst.mockResolvedValue({
      id: "document-1",
      projectId: "project-1",
      title: "Фото",
      fileName: "photo.webp",
      mimeType: "image/webp",
      storageKey: "project-1/photo.webp"
    });
    mocks.read.mockResolvedValue(Buffer.from("image"));
  });

  it("serves versioned image previews inline with private short-lived caching", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local/download?inline=1&v=2"), context);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("inline");
    expect(response.headers.get("cache-control")).toBe("private, max-age=300, must-revalidate");
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(response.headers.get("content-length")).toBe("5");
  });

  it("keeps ordinary downloads as attachments", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local/download"), context);

    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(response.headers.get("cache-control")).toBeNull();
  });
});
