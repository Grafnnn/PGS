import { describe, expect, it } from "vitest";
import {
  normalizeWorkforceAdmissionIdentity,
  workforceAdmissionRequestCreateSchema
} from "./workforce-admission-requests";

const validRequest = {
  requestNumber: "24-08/1",
  title: "Заявка на допуск работников",
  contractor: "Подрядная организация",
  objectName: "Строительный объект",
  validFrom: "2026-08-31",
  validUntil: "2026-09-30",
  workScope: "Устройство кровли",
  employmentType: "subcontract",
  members: [{
    fullName: "Сотрудник Тестовый",
    profession: "Кровельщик",
    kind: "worker",
    birthDate: "1990-01-01",
    citizenship: "Российская Федерация",
    documentType: "Паспорт",
    documentLast4: "1234"
  }]
};

describe("workforce admission request", () => {
  it("accepts a bounded request and normalizes member identity", () => {
    const parsed = workforceAdmissionRequestCreateSchema.parse(validRequest);
    expect(parsed.members[0].documentLast4).toBe("1234");
    expect(normalizeWorkforceAdmissionIdentity("  Сотрудник   Тестовый ")).toBe("сотрудник тестовый");
  });

  it("rejects a full document number and invalid access period", () => {
    expect(workforceAdmissionRequestCreateSchema.safeParse({
      ...validRequest,
      validUntil: "2026-08-01",
      members: [{ ...validRequest.members[0], documentLast4: "1234567890" }]
    }).success).toBe(false);
  });

  it("keeps document type descriptive rather than accepting identifiers", () => {
    expect(workforceAdmissionRequestCreateSchema.safeParse({
      ...validRequest,
      members: [{ ...validRequest.members[0], documentType: "Паспорт 1234567890" }]
    }).success).toBe(false);
  });

  it("requires at least one named worker", () => {
    expect(workforceAdmissionRequestCreateSchema.safeParse({ ...validRequest, members: [] }).success).toBe(false);
  });

  it("rejects duplicate people in one request", () => {
    expect(workforceAdmissionRequestCreateSchema.safeParse({
      ...validRequest,
      members: [validRequest.members[0], { ...validRequest.members[0], documentLast4: "5678" }]
    }).success).toBe(false);
  });
});
