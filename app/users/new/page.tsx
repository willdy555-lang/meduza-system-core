"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

export default function NewUserPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("administrator");
  const [active, setActive] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [checkingAccess, setCheckingAccess] = useState(true);

  useEffect(() => {
    async function checkAccess() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, active")
        .eq("id", user.id)
        .single();

      if (!profile || !profile.active || profile.role !== "director") {
        router.replace("/");
        return;
      }

      setCheckingAccess(false);
    }

    checkAccess();
  }, [router]);

  const formIsValid =
    fullName.trim().length > 0 &&
    login.trim().length > 0 &&
    password.length >= 6 &&
    role.length > 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!formIsValid || saving) {
      return;
    }

    setError("");
    setSaving(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/login");
        return;
      }

      const response = await fetch("/api/users/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          fullName: fullName.trim(),
          phone: phone.trim(),
          login: login.trim(),
          password,
          role,
          active,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Не удалось создать пользователя.");
        setSaving(false);
        return;
      }

      router.push("/users");
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Ошибка соединения с сервером.");
      setSaving(false);
    }
  }

  if (checkingAccess) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#f4f5f7",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Arial, sans-serif",
        }}
      >
        Загрузка...
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f4f5f7",
        padding: "32px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: "900px",
          margin: "0 auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "28px",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "14px",
                color: "#6b7280",
                marginBottom: "6px",
              }}
            >
              MEDUZA SYSTEM
            </div>

            <h1
              style={{
                margin: 0,
                fontSize: "30px",
                fontWeight: 700,
                color: "#111827",
              }}
            >
              Новый пользователь
            </h1>
          </div>

          <div
            style={{
              display: "flex",
              gap: "10px",
            }}
          >
            <button
              type="button"
              onClick={() => router.push("/")}
              style={secondaryButtonStyle}
            >
              Главное меню
            </button>

            <button
              type="button"
              onClick={() => router.push("/users")}
              style={secondaryButtonStyle}
            >
              ← Назад
            </button>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{
            background: "#ffffff",
            border: "1px solid #e1e4e8",
            borderRadius: "10px",
            padding: "28px",
          }}
        >
          <div style={gridStyle}>
            <Field label="Имя *">
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                style={inputStyle}
                placeholder="Имя пользователя"
              />
            </Field>

            <Field label="Телефон">
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={inputStyle}
                placeholder="+48..."
              />
            </Field>

            <Field label="Логин или Email *">
              <input
                type="text"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                style={inputStyle}
                placeholder="Например: owner1"
                autoCapitalize="none"
              />
            </Field>

            <Field label="Пароль *">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={inputStyle}
                placeholder="Минимум 6 символов"
              />
            </Field>

            <Field label="Роль *">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                style={inputStyle}
              >
                <option value="administrator">Administrator</option>
                <option value="rental_manager">Rental Manager</option>
                <option value="service_manager">Service Manager</option>
                <option value="vehicle_owner">Vehicle Owner</option>
                <option value="warehouse_keeper">Завхоз (только склад)</option>
              </select>
            </Field>

            <Field label="Статус">
              <select
                value={active ? "active" : "blocked"}
                onChange={(e) => setActive(e.target.value === "active")}
                style={inputStyle}
              >
                <option value="active">Активен</option>
                <option value="blocked">Заблокирован</option>
              </select>
            </Field>
          </div>

          {error && (
            <div
              style={{
                marginTop: "22px",
                padding: "12px 14px",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: "8px",
                color: "#b91c1c",
                fontSize: "14px",
              }}
            >
              {error}
            </div>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "10px",
              marginTop: "28px",
              paddingTop: "22px",
              borderTop: "1px solid #e5e7eb",
            }}
          >
            <button
              type="button"
              onClick={() => router.push("/users")}
              style={secondaryButtonStyle}
              disabled={saving}
            >
              Отмена
            </button>

            <button
              type="submit"
              disabled={!formIsValid || saving}
              style={{
                height: "44px",
                padding: "0 22px",
                border: "none",
                borderRadius: "8px",
                background:
                  formIsValid && !saving ? "#2563eb" : "#9ca3af",
                color: "#ffffff",
                fontSize: "14px",
                fontWeight: 600,
                cursor:
                  formIsValid && !saving ? "pointer" : "not-allowed",
                transition: "background 0.15s ease",
              }}
            >
              {saving ? "Сохранение..." : "Создать пользователя"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        style={{
          display: "block",
          marginBottom: "7px",
          fontSize: "13px",
          fontWeight: 600,
          color: "#374151",
        }}
      >
        {label}
      </label>

      {children}
    </div>
  );
}

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "22px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: "44px",
  boxSizing: "border-box",
  padding: "0 12px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  background: "#ffffff",
  color: "#111827",
  fontSize: "14px",
  outline: "none",
};

const secondaryButtonStyle: React.CSSProperties = {
  height: "42px",
  padding: "0 16px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  background: "#ffffff",
  color: "#111827",
  fontSize: "14px",
  cursor: "pointer",
};