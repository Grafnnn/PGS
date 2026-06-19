"use client";

import { FormEvent, useEffect, useState } from "react";
import { RefreshCw, UserPlus } from "lucide-react";

type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: "OWNER" | "ADMIN" | "MANAGER" | "VIEWER";
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

const roles: AdminUser["role"][] = ["OWNER", "ADMIN", "MANAGER", "VIEWER"];

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<AdminUser["role"]>("MANAGER");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadUsers() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/users");
      const data = (await response.json()) as { items?: AdminUser[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Не удалось загрузить пользователей.");
      setUsers(data.items ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Ошибка загрузки.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, role })
      });
      const data = (await response.json()) as { item?: AdminUser; temporaryPassword?: string; error?: string };
      if (!response.ok || !data.item) throw new Error(data.error ?? "Не удалось создать пользователя.");
      setUsers((current) => [...current, data.item as AdminUser]);
      setEmail("");
      setName("");
      setMessage(`Временный пароль для ${data.item.email}: ${data.temporaryPassword}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Ошибка создания.");
    } finally {
      setLoading(false);
    }
  }

  async function updateUser(userId: string, payload: Partial<Pick<AdminUser, "name" | "role" | "isActive">>) {
    const response = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = (await response.json()) as { item?: AdminUser; error?: string };
    if (!response.ok || !data.item) throw new Error(data.error ?? "Не удалось обновить пользователя.");
    setUsers((current) => current.map((user) => (user.id === userId ? (data.item as AdminUser) : user)));
  }

  async function resetPassword(userId: string) {
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/admin/users/${userId}/reset-password`, { method: "POST" });
      const data = (await response.json()) as { temporaryPassword?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Не удалось сбросить пароль.");
      setMessage(`Новый временный пароль: ${data.temporaryPassword}`);
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Ошибка сброса пароля.");
    }
  }

  return (
    <main className="page">
      <div className="header-row">
        <div>
          <div className="eyebrow">Администрирование</div>
          <h1>Пользователи</h1>
          <p className="muted">Управление доступом: роли, активность и временный пароль без email-провайдера.</p>
        </div>
        <button className="button secondary" type="button" onClick={() => void loadUsers()}>
          <RefreshCw size={18} />
          Обновить
        </button>
      </div>

      <section className="panel stack">
        <h2>Создать пользователя</h2>
        <form className="form-grid" onSubmit={(event) => void createUser(event)}>
          <label>
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Имя
            <input value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            Роль
            <select value={role} onChange={(event) => setRole(event.target.value as AdminUser["role"])}>
              {roles.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            &nbsp;
            <button className="button primary" disabled={loading} type="submit">
              <UserPlus size={18} />
              Создать
            </button>
          </label>
        </form>
        {message && <p className="success-text">{message}</p>}
        {error && <p className="error-text">{error}</p>}
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Имя</th>
                <th>Роль</th>
                <th>Статус</th>
                <th>Последний вход</th>
                <th>Создан</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.email}</td>
                  <td>
                    <input defaultValue={user.name} onBlur={(event) => void updateUser(user.id, { name: event.target.value })} />
                  </td>
                  <td>
                    <select value={user.role} onChange={(event) => void updateUser(user.id, { role: event.target.value as AdminUser["role"] })}>
                      {roles.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button className="button secondary" type="button" onClick={() => void updateUser(user.id, { isActive: !user.isActive })}>
                      {user.isActive ? "Активен" : "Отключен"}
                    </button>
                  </td>
                  <td>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("ru-RU") : "-"}</td>
                  <td>{new Date(user.createdAt).toLocaleDateString("ru-RU")}</td>
                  <td>
                    <button className="button secondary" type="button" onClick={() => void resetPassword(user.id)}>
                      Reset
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
