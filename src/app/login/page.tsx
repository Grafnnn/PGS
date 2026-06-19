import Link from "next/link";
import { LogIn } from "lucide-react";

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-box panel stack">
        <div>
          <div className="eyebrow">Локальный MVP</div>
          <h1>Вход в систему управления строительством</h1>
          <p className="muted">Демо-доступ уже создан для проверки вертикального среза.</p>
        </div>
        <label>
          Email
          <input defaultValue="demo@pgs.local" />
        </label>
        <label>
          Пароль
          <input defaultValue="demo-password" type="password" />
        </label>
        <Link className="button primary" href="/dashboard">
          <LogIn size={18} />
          Войти
        </Link>
        <p className="muted">Auth API: POST /api/auth/login, GET /api/auth/me.</p>
      </section>
    </main>
  );
}
