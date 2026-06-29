import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteProjectWithConfirmation, ProjectDeleteError } from "./project-delete";
import type { AppUser } from "./auth/permissions";

const { writeAuditMock } = vi.hoisted(() => ({
  writeAuditMock: vi.fn()
}));

vi.mock("@/lib/audit", () => ({
  writeAudit: writeAuditMock
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn()
  }
}));

const owner: AppUser = {
  id: "user-1",
  name: "Owner",
  email: "owner@pgs.local",
  role: "OWNER",
  authenticated: true
};

function countDelegate(value = 0) {
  return { count: vi.fn().mockResolvedValue(value) };
}

function projectDeleteClient(project: { id: string; organizationId: string; name: string; customer: string; object: string; isSmokeProject: boolean } | null) {
  const tx = {
    project: {
      findUnique: vi.fn().mockResolvedValue(project),
      delete: vi.fn().mockResolvedValue(project)
    },
    projectMember: countDelegate(1),
    userInvite: countDelegate(2),
    budgetSection: countDelegate(3),
    budgetItem: countDelegate(4),
    scheduleItem: countDelegate(5),
    workProgressEntry: countDelegate(6),
    material: countDelegate(7),
    materialNeed: countDelegate(8),
    procurementRequest: countDelegate(9),
    procurementRequestItem: countDelegate(10),
    supplierQuote: countDelegate(11),
    payment: countDelegate(12),
    cashflowPeriod: countDelegate(13),
    document: countDelegate(14),
    documentVersion: countDelegate(15),
    dailyReport: countDelegate(16),
    risk: countDelegate(17),
    aiMessage: countDelegate(18),
    importBatch: countDelegate(19),
    auditLog: countDelegate(20)
  };
  const client = {
    $transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx))
  };
  return { client, tx };
}

describe("deleteProjectWithConfirmation", () => {
  beforeEach(() => {
    writeAuditMock.mockReset();
  });

  it("rejects missing exact confirmation before opening a transaction", async () => {
    const { client } = projectDeleteClient(null);

    await expect(deleteProjectWithConfirmation({ projectId: "project-demo", actor: owner, confirmation: {}, client: client as never })).rejects.toMatchObject({
      status: 400
    });

    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it("returns 404 when the confirmed project is missing", async () => {
    const { client } = projectDeleteClient(null);

    await expect(
      deleteProjectWithConfirmation({ projectId: "missing", actor: owner, confirmation: { confirm: true, projectName: "Missing" }, client: client as never })
    ).rejects.toBeInstanceOf(ProjectDeleteError);
  });

  it("rejects a wrong project name and does not delete", async () => {
    const { client, tx } = projectDeleteClient({
      id: "project-demo",
      organizationId: "org-1",
      name: "Демо объект",
      customer: "Демо Строй",
      object: "Административное здание",
      isSmokeProject: false
    });

    await expect(
      deleteProjectWithConfirmation({ projectId: "project-demo", actor: owner, confirmation: { confirm: true, projectName: "Другое имя" }, client: client as never })
    ).rejects.toMatchObject({ status: 400 });

    expect(tx.project.delete).not.toHaveBeenCalled();
    expect(writeAuditMock).not.toHaveBeenCalled();
  });

  it("deletes project-owned data by cascade and writes organization-level audit without deleting global users", async () => {
    const { client, tx } = projectDeleteClient({
      id: "project-demo",
      organizationId: "org-1",
      name: "Демо объект",
      customer: "Демо Строй",
      object: "Административное здание",
      isSmokeProject: false
    });

    const result = await deleteProjectWithConfirmation({
      projectId: "project-demo",
      actor: owner,
      confirmation: { confirm: true, projectName: "Демо объект" },
      client: client as never
    });

    expect(result).toMatchObject({
      ok: true,
      deletedProjectId: "project-demo",
      deletedProjectName: "Демо объект",
      deletedCounts: {
        projectMembers: 1,
        userInvitesDetached: 2,
        budgetItems: 4,
        procurementRequestItems: 10,
        documentVersions: 15,
        auditLogs: 20
      }
    });
    expect(tx.procurementRequestItem.count).toHaveBeenCalledWith({ where: { request: { projectId: "project-demo" } } });
    expect(tx.documentVersion.count).toHaveBeenCalledWith({ where: { document: { projectId: "project-demo" } } });
    expect(tx.project.delete).toHaveBeenCalledWith({ where: { id: "project-demo" } });
    expect(writeAuditMock).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        organizationId: "org-1",
        projectId: null,
        actorId: "user-1",
        entity: "project",
        entityId: "project-demo",
        action: "delete",
        summary: "Удален проект: Демо объект",
        after: expect.objectContaining({
          deletedProjectId: "project-demo",
          deletedProjectName: "Демо объект"
        })
      })
    );
    expect("user" in tx).toBe(false);
  });
});
