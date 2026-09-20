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

export default function UserViewPage() {
  const router = useRouter();
  const params = useParams();
  const userId = String(params.id);

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserData | null>(null);
  const [error, setError] = useState("");

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

    setUser(result.user);
    setLoading(false);
  }

  function getRoleName(role: string) {
    switch (role) {
      case "administrator":
        return "Administrator";

      case "rental_manager":
        return "Rental Manager";

      case "service_manager":
        return "Service Manager";

      case "vehicle_owner":
        return "Vehicle Owner";

      default:
        return role;
    }
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
      <div
        style={{
          maxWidth: "900px",
          margin: "0 auto",
        }}
      >
        <div style={headerStyle}>
          <div>
            <div style={systemLabelStyle}>
              MEDUZA SYSTEM
            </div>

            <h1 style={titleStyle}>
              Просмотр пользователя
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

        {error && (
          <div style={errorStyle}>
            {error}
          </div>
        )}

        {user && (
          <div style={cardStyle}>
            <Info
              label="Имя"
              value={user.fullName || "—"}
            />

            <Info
              label="Телефон"
              value={user.phone || "—"}
            />

            <Info
              label="Логин / Email"
              value={user.login || "—"}
            />

            <Info
              label="Роль"
              value={getRoleName(user.role)}
            />

            <Info
              label="Статус"
              value={
                user.active
                  ? "Активен"
                  : "Заблокирован"
              }
            />

            <Info
              label="Пароль"
              value="Не отображается"
            />
          </div>
        )}
      </div>
    </main>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: "13px",
          fontWeight: 600,
          color: "#6b7280",
          marginBottom: "7px",
        }}
      >
        {label}
      </div>

      <div
        style={{
          minHeight: "44px",
          display: "flex",
          alignItems: "center",
          padding: "0 12px",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
          background: "#f9fafb",
          fontSize: "14px",
          color: "#111827",
        }}
      >
        {value}
      </div>
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
  gridTemplateColumns:
    "repeat(2, minmax(0, 1fr))",
  gap: "22px",
  background: "#ffffff",
  border: "1px solid #e1e4e8",
  borderRadius: "10px",
  padding: "28px",
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
  padding: "14px",
  background: "#fef2f2",
  border: "1px solid #fecaca",
  borderRadius: "8px",
  color: "#b91c1c",
};