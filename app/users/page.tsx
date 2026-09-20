"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

type UserProfile = {
  id: string;
  full_name: string | null;
  role: string;
  active: boolean;
  phone: string | null;
};

export default function UsersPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    setCurrentUserId(user.id);

    const { data: currentProfile, error: profileError } = await supabase
      .from("profiles")
      .select("role, active")
      .eq("id", user.id)
      .single();

    if (
      profileError ||
      !currentProfile ||
      !currentProfile.active ||
      currentProfile.role !== "director"
    ) {
      router.replace("/");
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, role, active, phone")
      .in("role", [
        "director",
        "administrator",
        "rental_manager",
        "service_manager",
        "vehicle_owner",
      ])
      .order("full_name", { ascending: true });

    if (error) {
      console.error(error);
      setUsers([]);
    } else {
      setUsers(data || []);
    }

    setLoading(false);
  }

  function getRoleName(role: string) {
    switch (role) {
      case "director":
        return "Director";
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

  const filteredUsers = users.filter((item) => {
    const text = `
      ${item.full_name || ""}
      ${item.phone || ""}
      ${getRoleName(item.role)}
    `.toLowerCase();

    return text.includes(search.trim().toLowerCase());
  });

  if (loading) {
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
          maxWidth: "1500px",
          margin: "0 auto",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
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
              Пользователи
            </h1>
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              type="button"
              onClick={() => router.push("/")}
              style={secondaryButtonStyle}
            >
              Главное меню
            </button>

            <button
              type="button"
              onClick={() => router.push("/")}
              style={secondaryButtonStyle}
            >
              ← Назад
            </button>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "16px",
            marginBottom: "18px",
          }}
        >
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по имени, телефону или роли"
            style={{
              width: "420px",
              height: "44px",
              boxSizing: "border-box",
              padding: "0 14px",
              border: "1px solid #d1d5db",
              borderRadius: "8px",
              background: "#ffffff",
              fontSize: "14px",
              outline: "none",
            }}
          />

          <button
            type="button"
            onClick={() => router.push("/users/new")}
            style={{
              height: "44px",
              padding: "0 20px",
              border: "none",
              borderRadius: "8px",
              background: "#111827",
              color: "#ffffff",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            + Добавить пользователя
          </button>
        </div>

        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e1e4e8",
            borderRadius: "10px",
            overflow: "hidden",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
            }}
          >
            <thead>
              <tr
                style={{
                  background: "#f9fafb",
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                <th style={thStyle}>Имя</th>
                <th style={thStyle}>Телефон</th>
                <th style={thStyle}>Роль</th>
                <th style={thStyle}>Статус</th>
                <th style={thStyle}>Действия</th>
              </tr>
            </thead>

            <tbody>
              {filteredUsers.map((item) => {
                const isCurrentUser = item.id === currentUserId;

                return (
                  <tr
                    key={item.id}
                    style={{
                      borderBottom: "1px solid #edf0f2",
                    }}
                  >
                    <td style={tdStyle}>
                      <strong>{item.full_name || "Без имени"}</strong>
                    </td>

                    <td style={tdStyle}>{item.phone || "—"}</td>

                    <td style={tdStyle}>{getRoleName(item.role)}</td>

                    <td style={tdStyle}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "5px 9px",
                          borderRadius: "6px",
                          fontSize: "13px",
                          fontWeight: 600,
                          background: item.active ? "#ecfdf3" : "#f3f4f6",
                          color: item.active ? "#166534" : "#6b7280",
                        }}
                      >
                        {item.active ? "Активен" : "Заблокирован"}
                      </span>
                    </td>

                    <td style={tdStyle}>
                      {isCurrentUser ? (
                        <span
                          style={{
                            color: "#6b7280",
                            fontSize: "13px",
                            fontWeight: 500,
                          }}
                        >
                          Текущий пользователь
                        </span>
                      ) : (
                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              router.push(`/users/${item.id}`)
                            }
                            style={secondarySmallButtonStyle}
                          >
                            Просмотр
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              router.push(`/users/${item.id}/edit`)
                            }
                            style={primarySmallButtonStyle}
                          >
                            Редактировать
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

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

const secondarySmallButtonStyle: React.CSSProperties = {
  height: "34px",
  padding: "0 14px",
  border: "1px solid #d1d5db",
  borderRadius: "7px",
  background: "#ffffff",
  color: "#111827",
  fontSize: "13px",
  fontWeight: 500,
  cursor: "pointer",
};

const primarySmallButtonStyle: React.CSSProperties = {
  height: "34px",
  padding: "0 14px",
  border: "none",
  borderRadius: "7px",
  background: "#111827",
  color: "#ffffff",
  fontSize: "13px",
  fontWeight: 500,
  cursor: "pointer",
};

const thStyle: React.CSSProperties = {
  padding: "14px 16px",
  textAlign: "left",
  fontSize: "13px",
  fontWeight: 600,
  color: "#4b5563",
};

const tdStyle: React.CSSProperties = {
  padding: "15px 16px",
  fontSize: "14px",
  color: "#111827",
};