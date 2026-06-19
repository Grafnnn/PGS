"use client";

import { FormEvent, useState } from "react";
import { LogIn } from "lucide-react";

const roleOptions = [
  { value: "owner", label: "Собственник / OWNER" },
  { value: "admin", label: "Администратор / ADMIN" },
  { value: "manager", label: "Руководитель проекта / MANAGER" },
  { value: "viewer", label: "Наблюдатель / VIEWER" }
];

export default function LoginPage() {
  const [email, setEmail] = useState("demo@pgs.local");
  const [password, setPassword] = useState("demo-password-change-me");
  const [role, setRole] = useState("owner");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, role })
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Не удалось войти.");
      window.location.href = "/dashboard";
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Ошибка входа.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-box panel stack" onSubmit={(event) => void submit(event)}>
        <div>
          <div className="eyebrow">Локальный MVP</div>
          <h1>Вход в систему управления строительством</h1>
          <p className="muted">Демо-доступ использует безопасную cookie-сессию и роли для проверки staging-поведения.</p>
        </div>
        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          Пароль
          <input value={password} type="password" onChange={(event) => setPassword(event.target.value)} />
        </label>
        <label>
          Роль
          <select value={role} onChange={(event) => setRole(event.target.value)}>
            {roleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="error-text">{error}</p>}
        <button className="button primary" disabled={loading} type="submit">
          <LogIn size={18} />
          {loading ? "Входим..." : "Войти"}
        </button>
        <p className="muted">Auth API: POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me.</p>
      </form>
    </main>
  );
}
