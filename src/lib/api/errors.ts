import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

export function getRequestId(request?: Request | NextRequest) {
  return request?.headers.get("x-request-id")?.trim() || randomUUID();
}

export function apiError(requestId: string, code: string, message: string, status = 400) {
  return NextResponse.json<ApiErrorBody>({ error: { code, message, requestId } }, { status, headers: { "x-request-id": requestId } });
}

export function apiOk<T>(requestId: string, body: T, status = 200) {
  return NextResponse.json(body, { status, headers: { "x-request-id": requestId } });
}
