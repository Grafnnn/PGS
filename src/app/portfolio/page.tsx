import { redirect } from "next/navigation";
import { PortfolioControlCenter } from "@/components/portfolio-control-center";
import { getCurrentUser } from "@/lib/auth/session";
import { loadPortfolioProjectsForPage } from "@/lib/portfolio-data";
import { buildPortfolioControlModel } from "@/lib/portfolio-control";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const projects = await loadPortfolioProjectsForPage(user);
  return <PortfolioControlCenter model={buildPortfolioControlModel(projects)} />;
}
