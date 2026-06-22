"use client";

import { FormEvent, useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";

function readError(data: { error?: string | { message?: string } }) {
  return typeof data.error === "string" ? data.error : data.error?.message ?? "Ошибка запроса.";
}

export default function AcceptInvitePage() {
  const [token, setToken] = useState("");
  const [name, setName] = useState("");
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
      const response = await fetch("/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name, password })
      });
      const data = (await response.json()) as { ok?: boolean; error?: string | { message?: string } };
      if (!response.ok || !data.ok) throw new Error(readError(data));
      setMessage("Приглашение принято. Теперь можно войти с новым паролем.");
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : "Не удалось принять приглашение.");
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
          <div className="eyebrow">PGS invite</div>
          <h1>Принять приглашение</h1>
          <p className="muted">Задайте имя и пароль. Токен хранится в базе только в виде SHA-256 hash.</p>
        </div>
        <label>
          Токен
          <input value={token} onChange={(event) => setToken(event.target.value)} />
        </label>
        <label>
          Имя
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Новый пароль
          <input value={password} type="password" onChange={(event) => setPassword(event.target.value)} />
        </label>
        {message && <p className="success-text">{message}</p>}
        {error && <p className="error-text">{error}</p>}
        <button className="button primary" disabled={loading} type="submit">
          <UserPlus size={18} />
          {loading ? "Сохраняем..." : "Принять приглашение"}
        </button>
      </form>
    </main>
  );
}
