import { z } from "zod";
import type { WorkforceAdmissionRequest } from "@/lib/types";

const optionalText = (max: number) => z.preprocess(
  (value) => typeof value === "string" && !value.trim() ? null : value,
  z.string().trim().max(max).nullable().optional()
);

const optionalDate = z.preprocess(
  (value) => value === "" || value === null || value === undefined ? null : value,
  z.coerce.date().nullable()
);

export const workforceAdmissionMemberInputSchema = z.object({
  fullName: z.string().trim().min(3).max(160),
  profession: z.string().trim().min(2).max(160),
  kind: z.enum(["worker", "engineer"]).default("worker"),
  birthDate: optionalDate,
  citizenship: optionalText(120),
  documentType: z.preprocess(
    (value) => typeof value === "string" && !value.trim() ? null : value,
    z.string().trim().regex(/^[\p{L}\s/.-]{2,120}$/u).nullable().optional()
  ),
  documentLast4: z.preprocess(
    (value) => typeof value === "string" && !value.trim() ? null : value,
    z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,4}$/).nullable().optional()
  )
});

export const workforceAdmissionRequestCreateSchema = z.object({
  requestNumber: z.string().trim().min(1).max(80),
  title: z.string().trim().min(3).max(240),
  contractor: z.string().trim().min(2).max(240),
  objectName: z.string().trim().min(2).max(500),
  validFrom: z.coerce.date(),
  validUntil: optionalDate,
  workScope: z.string().trim().min(3).max(2000),
  employmentType: z.enum(["staff", "hired", "subcontract"]).default("subcontract"),
  sourceFileName: optionalText(260),
  notes: optionalText(2000),
  members: z.array(workforceAdmissionMemberInputSchema).min(1).max(200)
}).superRefine((value, context) => {
  const identities = new Set<string>();
  value.members.forEach((member, index) => {
    const identity = `${normalizeWorkforceAdmissionIdentity(member.fullName)}:${normalizeWorkforceAdmissionIdentity(member.profession)}`;
    if (identities.has(identity)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Сотрудник повторяется в заявке.", path: ["members", index, "fullName"] });
    }
    identities.add(identity);
  });
}).refine(
  (value) => !value.validUntil || value.validUntil >= value.validFrom,
  { message: "Дата окончания допуска должна быть не раньше даты начала.", path: ["validUntil"] }
);

export function normalizeWorkforceAdmissionIdentity(value: string) {
  return value.trim().toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
}

type AdmissionMemberRecord = {
  id: string;
  resourceId: string | null;
  fullName: string;
  profession: string;
  kind: string;
  birthDate: Date | null;
  citizenship: string | null;
  documentType: string | null;
  documentLast4: string | null;
  status: string;
};

type AdmissionRequestRecord = {
  id: string;
  projectId: string;
  requestNumber: string;
  title: string;
  contractor: string;
  objectName: string;
  validFrom: Date;
  validUntil: Date | null;
  workScope: string;
  employmentType: string;
  status: string;
  sourceFileName: string | null;
  notes: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  members: AdmissionMemberRecord[];
};

export function serializeWorkforceAdmissionRequest(item: AdmissionRequestRecord): WorkforceAdmissionRequest {
  return {
    id: item.id,
    projectId: item.projectId,
    requestNumber: item.requestNumber,
    title: item.title,
    contractor: item.contractor,
    objectName: item.objectName,
    validFrom: item.validFrom.toISOString(),
    validUntil: item.validUntil?.toISOString() ?? null,
    workScope: item.workScope,
    employmentType: item.employmentType as WorkforceAdmissionRequest["employmentType"],
    status: item.status as WorkforceAdmissionRequest["status"],
    sourceFileName: item.sourceFileName,
    notes: item.notes,
    approvedAt: item.approvedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    members: item.members.map((member) => ({
      id: member.id,
      resourceId: member.resourceId,
      fullName: member.fullName,
      profession: member.profession,
      kind: member.kind as "worker" | "engineer",
      birthDate: member.birthDate?.toISOString() ?? null,
      citizenship: member.citizenship,
      documentType: member.documentType,
      documentLast4: member.documentLast4,
      status: member.status as "pending" | "approved" | "rejected"
    }))
  };
}
