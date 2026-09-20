"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

export default function LoginPage() {
  const router = useRouter();

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const canLogin =
    login.trim().length > 0 &&
    password.length >= 6;

  async function handleLogin() {
    if (!canLogin || loading) return;

    setMessage("");
    setLoading(true);

    const enteredLogin = login.trim();

    // Если введен email — используем как есть.
    // Если обычный логин — превращаем во внутренний email MEDUZA.
    const authEmail = enteredLogin.includes("@")
      ? enteredLogin.toLowerCase()
      : `${enteredLogin.toLowerCase()}@meduza.local`;

    const { data, error } =
      await supabase.auth.signInWithPassword({
        email: authEmail,
        password,
      });

    if (error || !data.user) {
      setMessage("Неверный логин или пароль.");
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } =
      await supabase
        .from("profiles")
        .select("role, active")
        .eq("id", data.user.id)
        .single();

    if (profileError || !profile) {
      await supabase.auth.signOut();
      setMessage("Профиль пользователя не найден.");
      setLoading(false);
      return;
    }

    if (!profile.active) {
      await supabase.auth.signOut();
      setMessage("Учетная запись отключена.");
      setLoading(false);
      return;
    }

    if (profile.role === "vehicle_owner") {
      router.push("/owner");
      router.refresh();
      return;
    }

    router.push("/");
    router.refresh();
  }

  const fieldStyle = {
    width: "100%",
    height: 46,
    padding: "0 12px",
    fontSize: 15,
    border: "1px solid #cfcfcf",
    borderRadius: 8,
    boxSizing: "border-box" as const,
    background: "white",
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f5f6f8",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "white",
          borderRadius: 14,
          padding: 30,
          boxShadow: "0 1px 8px rgba(0,0,0,.08)",
        }}
      >
        <h1
          style={{
            marginTop: 0,
            marginBottom: 4,
          }}
        >
          MEDUZA SYSTEM
        </h1>

        <div
          style={{
            color: "#666",
            marginBottom: 28,
          }}
        >
          Вход в систему
        </div>

        <label
          style={{
            display: "block",
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 18,
          }}
        >
          Логин или Email

          <input
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            placeholder="Логин или email"
            autoComplete="username"
            style={{
              ...fieldStyle,
              marginTop: 6,
            }}
          />
        </label>

        <label
          style={{
            display: "block",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Пароль

          <div
            style={{
              display: "flex",
              gap: 8,
              marginTop: 6,
            }}
          >
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Пароль"
              autoComplete="current-password"
              style={{
                ...fieldStyle,
                flex: 1,
              }}
            />

            <button
              type="button"
              onClick={() =>
                setShowPassword((value) => !value)
              }
              style={{
                height: 46,
                padding: "0 14px",
                borderRadius: 8,
                border: "1px solid #cfcfcf",
                background: "white",
                cursor: "pointer",
              }}
            >
              {showPassword ? "Скрыть" : "Показать"}
            </button>
          </div>
        </label>

        {message && (
          <div
            style={{
              marginTop: 18,
              padding: 12,
              border: "1px solid #ddd",
              borderRadius: 8,
              fontWeight: 600,
            }}
          >
            {message}
          </div>
        )}

        <button
          type="button"
          onClick={handleLogin}
          disabled={!canLogin || loading}
          style={{
            width: "100%",
            height: 46,
            marginTop: 24,
            border: "none",
            borderRadius: 8,
            fontSize: 15,
            fontWeight: 700,

            background:
              canLogin && !loading
                ? "#2563eb"
                : "#d1d5db",

            color:
              canLogin && !loading
                ? "white"
                : "#6b7280",

            cursor:
              canLogin && !loading
                ? "pointer"
                : "not-allowed",
          }}
        >
          {loading ? "Вход..." : "Войти"}
        </button>
      </div>
    </main>
  );
}