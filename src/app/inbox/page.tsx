import { redirect } from "next/navigation";
import { ApprovalInboxWorkspace } from "@/components/approval-inbox-workspace";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <ApprovalInboxWorkspace />;
}
