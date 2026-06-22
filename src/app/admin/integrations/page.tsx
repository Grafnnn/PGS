import { Cable, Github, Mail, Server, ShieldCheck } from "lucide-react";
import { canManageUsers } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { connectorSummary, getConnectorStatuses } from "@/lib/connectors/status";
import { getEmailProviderStatus } from "@/lib/email";

const icons: Record<string, React.ReactNode> = {
  github: <Github size={18} />,
  google_drive: <Cable size={18} />,
  gmail: <Mail size={18} />,
  google_calendar: <Cable size={18} />,
  render: <Server size={18} />,
  vercel: <Server size={18} />,
  openai: <ShieldCheck size={18} />
};

export default async function AdminIntegrationsPage() {
  const currentUser = await getCurrentUser();
  if (!canManageUsers(currentUser)) {
    return (
      <main className="page">
        <section className="panel">
          <h1>Доступ запрещен</h1>
          <p className="muted">Статус интеграций доступен только OWNER/ADMIN.</p>
        </section>
      </main>
    );
  }

  const statuses = getConnectorStatuses();
  const summary = connectorSummary(statuses);
  const email = getEmailProviderStatus();

  return (
    <main className="page">
      <div className="header-row">
        <div>
          <div className="eyebrow">Администрирование</div>
          <h1>Интеграции и коннекторы</h1>
          <p className="muted">Readiness-слой для GitHub, Google, email, deployment и AI. Внешних мутаций на этой странице нет.</p>
        </div>
      </div>

      <section className="grid grid-3">
        <div className="panel kpi">
          <div className="kpi-label">Коннекторы</div>
          <div className="kpi-value">{summary.total}</div>
        </div>
        <div className="panel kpi">
          <div className="kpi-label">Сконфигурированы</div>
          <div className="kpi-value">{summary.configured}</div>
        </div>
        <div className="panel kpi">
          <div className="kpi-label">Email provider</div>
          <div className="kpi-value">{email.provider}</div>
        </div>
      </section>

      <section className="panel stack" style={{ marginTop: 16 }}>
        <h2>Статус готовности</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Коннектор</th>
                <th>Режим</th>
                <th>Состояние</th>
                <th>Metadata</th>
                <th>Заметки</th>
                <th>Предупреждения</th>
              </tr>
            </thead>
            <tbody>
              {statuses.map((connector) => (
                <tr key={connector.id}>
                  <td>
                    <div style={{ alignItems: "center", display: "flex", gap: 8 }}>
                      {icons[connector.id]}
                      <strong>{connector.label}</strong>
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${connector.mode === "enabled" ? "green" : connector.mode === "read_only" ? "blue" : "gray"}`}>{connector.mode}</span>
                  </td>
                  <td>
                    <span className={`badge ${connector.configured ? "green" : "gray"}`}>{connector.configured ? "configured" : "not configured"}</span>
                  </td>
                  <td>{connector.metadata ? Object.entries(connector.metadata).map(([key, value]) => `${key}: ${value}`).join("; ") : "-"}</td>
                  <td>{connector.notes.join(" ")}</td>
                  <td className={connector.warnings.length ? "delta-warn" : "muted"}>{connector.warnings.join(" ") || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {email.warning && <p className="delta-warn">{email.warning}</p>}
      </section>
    </main>
  );
}
