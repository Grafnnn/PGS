"use client";

import { FormEvent, useEffect, useState } from "react";
import { LogIn, LogOut } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { LOGIN_INITIAL_CREDENTIALS } from "@/lib/login-form";

type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  authenticated: boolean;
};

function readError(data: { error?: string | { message?: string } }) {
  return typeof data.error === "string" ? data.error : data.error?.message ?? "Не удалось войти.";
}

export default function LoginPage() {
  const [email, setEmail] = useState<string>(LOGIN_INITIAL_CREDENTIALS.email);
  const [password, setPassword] = useState<string>(LOGIN_INITIAL_CREDENTIALS.password);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/auth/me")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { user?: CurrentUser } | null) => setCurrentUser(data?.user ?? null))
      .catch(() => setCurrentUser(null));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = (await response.json()) as { error?: string | { message?: string } };
      if (!response.ok) throw new Error(readError(data));
      window.location.href = "/dashboard";
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Ошибка входа.");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    setLoading(true);
    setError("");
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setCurrentUser(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-box panel stack auth-card" onSubmit={(event) => void submit(event)}>
        <div className="auth-brand">
          <BrandLogo href="/dashboard" />
        </div>
        <div>
          <div className="eyebrow">Project workspace</div>
          <h1>Вход в PGS</h1>
          <p className="muted">Операционный контур для строительных проектов: бюджет, график, снабжение, финансы и риски.</p>
        </div>
        {currentUser && (
          <div className="inline-status">
            <span>
              {currentUser.name} · {currentUser.role}
            </span>
            <button className="button secondary" disabled={loading} type="button" onClick={() => void logout()}>
              <LogOut size={16} />
              Выйти
            </button>
          </div>
        )}
        <label>
          Email
          <input
            autoComplete="username"
            inputMode="email"
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Пароль
          <input
            autoComplete="current-password"
            required
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button className="button primary" disabled={loading} type="submit">
          <LogIn size={18} />
          {loading ? "Входим..." : "Войти"}
        </button>
        <p className="muted">Сессия и роль проверяются сервером.</p>
      </form>
    </main>
  );
}
