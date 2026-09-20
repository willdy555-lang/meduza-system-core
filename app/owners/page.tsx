"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);
function ownerSurname(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : name.trim();
}

function ownerSortKey(owner: { owner_type?: string | null; name: string }): string {
  const key =
    owner.owner_type === "company" ? owner.name : ownerSurname(owner.name);
  return key.trim().toLowerCase();
}

function ownerDisplayName(owner: { owner_type?: string | null; name: string }): string {
  if (owner.owner_type === "company") {
    return owner.name;
  }
  const parts = owner.name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return owner.name;
  }
  const surname = parts[parts.length - 1];
  const rest = parts.slice(0, parts.length - 1).join(" ");
  return `${surname} ${rest}`;
}


type Owner = {
  id: string;
  owner_type: string;
  name: string;
  phone: string | null;
  email: string | null;
};

export default function OwnersPage() {
  const router = useRouter();

  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadOwners() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, active")
        .eq("id", user.id)
        .single();

      if (!profile || !profile.active) {
        await supabase.auth.signOut();
        window.location.href = "/login";
        return;
      }

      if (profile.role === "vehicle_owner") {
        window.location.href = "/owner";
        return;
      }

      if (profile.role === "rental_manager") {
        window.location.href = "/partner";
        return;
      }

      const { data, error } = await supabase
        .from("vehicle_owners")
        .select("id, owner_type, name, phone, email")
        .is("archived_at", null);

      if (error) {
        setError(error.message);
      } else {
        const sorted = (data ?? [])
          .slice()
          .sort((a, b) =>
            ownerSortKey(a).localeCompare(ownerSortKey(b), "ru")
          );
        setOwners(sorted);
      }

      setLoading(false);
    }

    loadOwners();
  }, []);

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <div style={headerStyle}>
          <div>
            <div style={systemTitleStyle}>MEDUZA SYSTEM</div>
            <h1 style={titleStyle}>Собственники</h1>
            <div style={subtitleStyle}>Владельцы автомобилей</div>
          </div>

          <div style={headerButtonsStyle}>
            <button
              type="button"
              onClick={() => router.push("/")}
              style={secondaryButtonStyle}
            >
              Главное меню
            </button>

            <button
              type="button"
              onClick={() => router.push("/partner")}
              style={secondaryButtonStyle}
            >
              ← Назад
            </button>

            <button
              type="button"
              onClick={() => router.push("/owners/new")}
              style={primaryButtonStyle}
            >
              + Добавить собственника
            </button>
          </div>
        </div>

        {loading && <div>Загрузка...</div>}

        {error && (
          <div
            style={{
              padding: 16,
              border: "1px solid #ddd",
              borderRadius: 8,
            }}
          >
            Ошибка загрузки: {error}
          </div>
        )}

        {!loading && !error && owners.length === 0 && (
          <div
            style={{
              padding: 30,
              background: "white",
              borderRadius: 12,
              border: "1px solid #e5e5e5",
            }}
          >
            Собственников пока нет.
          </div>
        )}

        {!loading && !error && owners.length > 0 && (
          <div
            style={{
              background: "white",
              border: "1px solid #e5e5e5",
              borderRadius: 12,
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
                    background: "#f5f5f5",
                    textAlign: "left",
                  }}
                >
                  <th style={{ padding: 14 }}>Собственник</th>
                  <th style={{ padding: 14 }}>Тип</th>
                  <th style={{ padding: 14 }}>Телефон</th>
                  <th style={{ padding: 14 }}>Email</th>
                  <th style={{ padding: 14 }}>Действия</th>
                </tr>
              </thead>

              <tbody>
                {owners.map((owner) => (
                  <tr
                    key={owner.id}
                    style={{
                      borderTop: "1px solid #eee",
                    }}
                  >
                    <td
                      style={{
                        padding: 14,
                        fontWeight: 600,
                      }}
                    >
                      {ownerDisplayName(owner)}
                    </td>

                    <td style={{ padding: 14 }}>
                      {owner.owner_type === "company"
                        ? "Компания"
                        : "Физ. лицо"}
                    </td>

                    <td style={{ padding: 14 }}>
                      {owner.phone || "—"}
                    </td>

                    <td style={{ padding: 14 }}>
                      {owner.email || "—"}
                    </td>

                    <td style={{ padding: 14 }}>
                      <div style={{ display: "flex", gap: 10 }}>
                        <button
                          type="button"
                          onClick={() => router.push(`/owners/${owner.id}`)}
                          style={rowButtonStyle}
                        >
                          Просмотр
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            router.push(`/owners/${owner.id}/edit`)
                          }
                          style={rowButtonStyle}
                        >
                          Редактировать
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f4f5f7",
  padding: "32px",
  fontFamily: "Arial, sans-serif",
  color: "#111827",
};

const containerStyle: React.CSSProperties = {
  maxWidth: "1400px",
  margin: "0 auto",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "28px",
};

const systemTitleStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#6b7280",
  marginBottom: "6px",
  letterSpacing: "0.04em",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "30px",
  fontWeight: 700,
};

const subtitleStyle: React.CSSProperties = {
  marginTop: "6px",
  fontSize: "14px",
  color: "#6b7280",
};

const headerButtonsStyle: React.CSSProperties = {
  display: "flex",
  gap: "10px",
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

const rowButtonStyle: React.CSSProperties = {
  height: "34px",
  padding: "0 13px",
  border: "1px solid #d1d5db",
  borderRadius: "7px",
  background: "#ffffff",
  color: "#111827",
  fontSize: "13px",
  cursor: "pointer",
};

const primaryButtonStyle: React.CSSProperties = {
  height: "42px",
  padding: "0 17px",
  border: "none",
  borderRadius: "8px",
  background: "#2563eb",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
};
