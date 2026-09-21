"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

type UserData = {
  id: string;
  fullName: string;
  phone: string;
  login: string;
  role: string;
  active: boolean;
};

export default function UserEditPage() {
  const router = useRouter();
  const params = useParams();
  const userId = String(params.id);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [login, setLogin] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [role, setRole] = useState("");
  const [active, setActive] = useState(true);

  const [original, setOriginal] = useState<UserData | null>(null);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadUser();
  }, [userId]);

  async function loadUser() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      router.replace("/login");
      return;
    }

    const { data: requesterProfile } = await supabase
      .from("profiles")
      .select("role, active")
      .eq("id", session.user.id)
      .single();

    if (!requesterProfile || !requesterProfile.active || requesterProfile.role !== "director") {
      router.replace("/");
      return;
    }

    const response = await fetch(`/api/users/${userId}`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    const result = await response.json();

    if (!response.ok) {
      setError(result.error || "Не удалось загрузить пользователя.");
      setLoading(false);
      return;
    }

    const user: UserData = result.user;

    setFullName(user.fullName);
    setPhone(user.phone);
    setLogin(user.login);
    setRole(user.role);
    setActive(user.active);

    setOriginal(user);

    setLoading(false);
  }

  const hasChanges =
    original !== null &&
    (
      fullName.trim() !== original.fullName ||
      phone.trim() !== original.phone ||
      login.trim().toLowerCase() !== original.login.toLowerCase() ||
      role !== original.role ||
      active !== original.active ||
      newPassword.length > 0
    );

  const formIsValid =
    fullName.trim().length > 0 &&
    login.trim().length > 0 &&
    (newPassword.length === 0 || newPassword.length >= 6);

  const canSave = formIsValid && hasChanges && !saving;

  async function handleSave() {
    if (!canSave) return;

    setSaving(true);
    setError("");
    setSuccess("");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      router.replace("/login");
      return;
    }

    const response = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        fullName: fullName.trim(),
        phone: phone.trim(),
        login: login.trim(),
        newPassword,
        role,
        active,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      setError(result.error || "Не удалось сохранить изменения.");
      setSaving(false);
      return;
    }

    const updated: UserData = result.user;

    setFullName(updated.fullName);
    setPhone(updated.phone);
    setLogin(updated.login);
    setRole(updated.role);
    setActive(updated.active);
    setNewPassword("");
    setOriginal(updated);

    setSuccess("Изменения сохранены.");
    setSaving(false);
  }

  if (loading) {
    return (
      <main style={centerStyle}>
        Загрузка...
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <div style={headerStyle}>
          <div>
            <div style={systemLabelStyle}>MEDUZA SYSTEM</div>
            <h1 style={titleStyle}>Редактирование пользователя</h1>
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={() => router.push("/")}
              style={secondaryButtonStyle}
            >
              Главное меню
            </button>

            <button
              onClick={() => router.push(`/users/${userId}`)}
              style={secondaryButtonStyle}
            >
              ← Назад
            </button>
          </div>
        </div>

        <div style={cardStyle}>
          <Field label="Имя *">
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              style={inputStyle}
            />
          </Field>

          <Field label="Телефон">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={inputStyle}
              placeholder="+48..."
            />
          </Field>

          <Field label="Логин или Email *">
            <input
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              style={inputStyle}
            />
          </Field>

          <Field label="Новый пароль">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              style={inputStyle}
              placeholder="Оставьте пустым, если не меняете"
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

          {error && (
            <div style={{ ...errorStyle, gridColumn: "1 / -1" }}>
              {error}
            </div>
          )}

          {success && (
            <div style={{ ...successStyle, gridColumn: "1 / -1" }}>
              {success}
            </div>
          )}

          <div
            style={{
              gridColumn: "1 / -1",
              display: "flex",
              justifyContent: "flex-end",
              gap: "10px",
              marginTop: "10px",
              paddingTop: "22px",
              borderTop: "1px solid #e5e7eb",
            }}
          >
            <button
              type="button"
              onClick={() => router.push(`/users/${userId}`)}
              style={secondaryButtonStyle}
            >
              Отмена
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              style={{
                height: "44px",
                padding: "0 22px",
                border: "none",
                borderRadius: "8px",
                background: canSave ? "#2563eb" : "#9ca3af",
                color: "#ffffff",
                fontSize: "14px",
                fontWeight: 600,
                cursor: canSave ? "pointer" : "not-allowed",
              }}
            >
              {saving ? "Сохранение..." : "Сохранить изменения"}
            </button>
          </div>
        </div>
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

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f4f5f7",
  padding: "32px",
  fontFamily: "Arial, sans-serif",
};

const centerStyle: React.CSSProperties = {
  ...pageStyle,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "28px",
};

const systemLabelStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#6b7280",
  marginBottom: "6px",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "30px",
  fontWeight: 700,
  color: "#111827",
};

const cardStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "22px",
  background: "#ffffff",
  border: "1px solid #e1e4e8",
  borderRadius: "10px",
  padding: "28px",
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

const errorStyle: React.CSSProperties = {
  padding: "12px 14px",
  background: "#fef2f2",
  border: "1px solid #fecaca",
  borderRadius: "8px",
  color: "#b91c1c",
  fontSize: "14px",
};

const successStyle: React.CSSProperties = {
  padding: "12px 14px",
  background: "#ecfdf3",
  border: "1px solid #bbf7d0",
  borderRadius: "8px",
  color: "#166534",
  fontSize: "14px",
};