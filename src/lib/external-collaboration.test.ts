import { describe, expect, it } from "vitest";
import {
  externalCollaborationCreateSchema,
  externalCollaborationLinkIsUsable,
  externalCollaborationLinkState,
  serializeExternalCollaborationLink
} from "@/lib/external-collaboration";

const now = new Date("2026-07-27T12:00:00Z");
const base = {
  id: "link-1",
  projectId: "project-1",
  entityType: "rfi",
  entityId: "rfi-1",
  recipientName: "Технадзор",
  recipientEmail: "reviewer@example.test",
  status: "active",
  expiresAt: new Date("2026-07-28T12:00:00Z"),
  responseLimit: 1,
  responseCount: 0,
  lastRespondedAt: null,
  revokedAt: null,
  createdAt: now,
  updatedAt: now
};

describe("external collaboration safety", () => {
  it("accepts only one-response links", () => {
    expect(externalCollaborationCreateSchema.safeParse({
      entityType: "rfi",
      entityId: "rfi-1",
      recipientEmail: "reviewer@example.test",
      responseLimit: 1
    }).success).toBe(true);
    expect(externalCollaborationCreateSchema.safeParse({
      entityType: "rfi",
      entityId: "rfi-1",
      recipientEmail: "reviewer@example.test",
      responseLimit: 2
    }).success).toBe(false);
  });

  it("closes expired, responded, and revoked links", () => {
    expect(externalCollaborationLinkIsUsable(base, now)).toBe(true);
    expect(externalCollaborationLinkState({ ...base, expiresAt: now }, now)).toBe("expired");
    expect(externalCollaborationLinkState({ ...base, responseCount: 1 }, now)).toBe("responded");
    expect(externalCollaborationLinkState({ ...base, status: "revoked" }, now)).toBe("revoked");
  });

  it("never serializes the token hash", () => {
    const serialized = serializeExternalCollaborationLink(base, now);
    expect(serialized).not.toHaveProperty("tokenHash");
    expect(JSON.stringify(serialized)).not.toContain("secret");
  });
});
