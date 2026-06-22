"use client";

import { FormEvent, useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";

function readError(data: { error?: string | { message?: string } }) {
  return typeof data.error === "string" ? data.error : data.error?.message ?? "Ошибка запроса.";
}

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") ?? "");
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password })
      });
      const data = (await response.json()) as { ok?: boolean; error?: string | { message?: string } };
      if (!response.ok || !data.ok) throw new Error(readError(data));
      setMessage("Пароль изменен. Старые сессии отозваны.");
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Не удалось изменить пароль.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-box panel stack auth-card" onSubmit={(event) => void submit(event)}>
        <div className="auth-brand">
          <BrandLogo href="/login" />
        </div>
        <div>
          <div className="eyebrow">PGS auth</div>
          <h1>Сброс пароля</h1>
          <p className="muted">Одноразовый reset-token хранится в базе только в виде SHA-256 hash и после использования закрывается.</p>
        </div>
        <label>
          Токен
          <input value={token} onChange={(event) => setToken(event.target.value)} />
        </label>
        <label>
          Новый пароль
          <input value={password} type="password" onChange={(event) => setPassword(event.target.value)} />
        </label>
        {message && <p className="success-text">{message}</p>}
        {error && <p className="error-text">{error}</p>}
        <button className="button primary" disabled={loading} type="submit">
          <KeyRound size={18} />
          {loading ? "Меняем..." : "Изменить пароль"}
        </button>
      </form>
    </main>
  );
}
