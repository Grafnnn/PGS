import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { revokeCurrentSession, SESSION_COOKIE } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  try {
    await revokeCurrentSession(request.cookies.get(SESSION_COOKIE)?.value);
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientInitializationError)) console.error(error);
  }
  response.cookies.set(SESSION_COOKIE, "", { expires: new Date(0), path: "/" });
  response.cookies.set("pgs_role", "", { expires: new Date(0), path: "/" });
  return response;
}
