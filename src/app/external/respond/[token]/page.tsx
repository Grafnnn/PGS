import { ExternalCollaborationResponse } from "@/components/external-collaboration-response";

export const dynamic = "force-dynamic";

export default function ExternalCollaborationPage({ params }: { params: { token: string } }) {
  return <ExternalCollaborationResponse token={params.token} />;
}
