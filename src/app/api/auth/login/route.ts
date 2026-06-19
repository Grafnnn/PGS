import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";

export async function POST(request: NextRequest) {
  const env = getEnv();
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "");
  const password = String(body.password ?? "");
  const role = String(body.role ?? "owner").toLowerCase();

  if (email !== env.DEMO_ADMIN_EMAIL || password !== env.DEMO_ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Invalid demo credentials" }, { status: 401 });
  }

  const response = NextResponse.json({
    user: {
      id: "session-user",
      email,
      name: "Demo Admin",
      role: role.toUpperCase()
    }
  });

  response.cookies.set("pgs_role", ["owner", "admin", "manager", "viewer"].includes(role) ? role : "owner", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: env.NODE_ENV === "production"
  });

  return response;
}
