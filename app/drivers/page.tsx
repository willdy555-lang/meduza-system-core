"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

type Driver = {
  id: string;
  last_name: string;
  first_name: string;
};

export default function DriversPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [search, setSearch] = useState("");
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    loadPage();
  }, []);

  async function loadPage() {
    setLoading(true);
    setErrorText("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, active")
      .eq("id", user.id)
      .single();

    if (profileError || !profile || !profile.active) {
      await supabase.auth.signOut();
      router.replace("/login");
      return;
    }

    if (profile.role === "vehicle_owner") {
      router.replace("/owner");
      return;
    }

    const { data, error } = await supabase
      .from("drivers")
      .select(`
        id,
        last_name,
        first_name
      `)
      .is("archived_at", null)
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true });

    if (error) {
      console.error(error);
      setErrorText("Не удалось загрузить список водителей.");
      setLoading(false);
      return;
    }

    setDrivers(data ?? []);
    setLoading(false);
  }

  const filteredDrivers = useMemo(() => {
    const value = search.trim().toLowerCase();

    if (!value) return drivers;

    return drivers.filter((driver) => {
      const lastName = (driver.last_name ?? "").toLowerCase();
      const firstName = (driver.first_name ?? "").toLowerCase();
      const fullName = `${lastName} ${firstName}`;

      return (
        lastName.includes(value) ||
        firstName.includes(value) ||
        fullName.includes(value)
      );
    });
  }, [drivers, search]);

  if (loading) {
    return <main style={loadingStyle}>Загрузка...</main>;
  }

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <div style={headerStyle}>
          <div>
            <div style={systemTitleStyle}>MEDUZA SYSTEM</div>
            <h1 style={titleStyle}>Водители</h1>
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
          </div>
        </div>

        <div style={toolbarStyle}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по фамилии или имени"
            style={searchInputStyle}
          />

          <button
            type="button"
            onClick={() => router.push("/drivers/new")}
            style={primaryButtonStyle}
          >
            + Добавить водителя
          </button>
        </div>

        {errorText && <div style={errorStyle}>{errorText}</div>}

        <div style={tableWrapperStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={lastNameHeaderStyle}>Фамилия</th>
                <th style={firstNameHeaderStyle}>Имя</th>
                <th style={actionHeaderStyle}>Действия</th>
              </tr>
            </thead>

            <tbody>
              {filteredDrivers.length === 0 ? (
                <tr>
                  <td colSpan={3} style={emptyStyle}>
                    {search
                      ? "По вашему запросу ничего не найдено."
                      : "Водителей пока нет."}
                  </td>
                </tr>
              ) : (
                filteredDrivers.map((driver) => (
                  <tr key={driver.id}>
                    <td style={lastNameCellStyle}>
                      <strong>{driver.last_name}</strong>
                    </td>

                    <td style={firstNameCellStyle}>
                      {driver.first_name}
                    </td>

                    <td style={actionCellStyle}>
                      <div style={actionsStyle}>
                        <button
                          type="button"
                          onClick={() =>
                            router.push(`/drivers/${driver.id}`)
                          }
                          style={viewButtonStyle}
                        >
                          Просмотр
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            router.push(`/drivers/${driver.id}/edit`)
                          }
                          style={editButtonStyle}
                        >
                          Редактировать
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={countStyle}>
          Водителей: {filteredDrivers.length}
        </div>
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

const loadingStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f4f5f7",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "Arial, sans-serif",
  color: "#111827",
};

const containerStyle: React.CSSProperties = {
  maxWidth: "1400px",
  margin: "0 auto",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
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

const headerButtonsStyle: React.CSSProperties = {
  display: "flex",
  gap: "10px",
};

const toolbarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "16px",
  marginBottom: "20px",
};

const searchInputStyle: React.CSSProperties = {
  flex: 1,
  height: "44px",
  padding: "0 14px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  background: "#ffffff",
  fontSize: "14px",
  outline: "none",
};

const primaryButtonStyle: React.CSSProperties = {
  height: "44px",
  padding: "0 18px",
  border: "none",
  borderRadius: "8px",
  background: "#2563eb",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
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

const tableWrapperStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: "10px",
  overflow: "hidden",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  tableLayout: "fixed",
};

const baseHeaderStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "14px 18px",
  background: "#f9fafb",
  borderBottom: "1px solid #e5e7eb",
  fontSize: "13px",
  fontWeight: 600,
  color: "#4b5563",
};

const lastNameHeaderStyle: React.CSSProperties = {
  ...baseHeaderStyle,
  width: "34%",
};

const firstNameHeaderStyle: React.CSSProperties = {
  ...baseHeaderStyle,
  width: "34%",
};

const actionHeaderStyle: React.CSSProperties = {
  ...baseHeaderStyle,
  width: "32%",
};

const baseCellStyle: React.CSSProperties = {
  padding: "16px 18px",
  borderBottom: "1px solid #eeeeee",
  fontSize: "14px",
  color: "#111827",
};

const lastNameCellStyle: React.CSSProperties = {
  ...baseCellStyle,
  width: "34%",
};

const firstNameCellStyle: React.CSSProperties = {
  ...baseCellStyle,
  width: "34%",
};

const actionCellStyle: React.CSSProperties = {
  ...baseCellStyle,
  width: "32%",
};

const actionsStyle: React.CSSProperties = {
  display: "flex",
  gap: "10px",
};

const viewButtonStyle: React.CSSProperties = {
  height: "34px",
  padding: "0 13px",
  border: "1px solid #d1d5db",
  borderRadius: "7px",
  background: "#ffffff",
  color: "#111827",
  fontSize: "13px",
  cursor: "pointer",
};

const editButtonStyle: React.CSSProperties = {
  height: "34px",
  padding: "0 13px",
  border: "1px solid #d1d5db",
  borderRadius: "7px",
  background: "#ffffff",
  color: "#111827",
  fontSize: "13px",
  cursor: "pointer",
};

const emptyStyle: React.CSSProperties = {
  padding: "40px 16px",
  textAlign: "center",
  color: "#6b7280",
  fontSize: "14px",
};

const countStyle: React.CSSProperties = {
  marginTop: "12px",
  fontSize: "13px",
  color: "#6b7280",
};

const errorStyle: React.CSSProperties = {
  marginBottom: "16px",
  padding: "12px 14px",
  background: "#ffffff",
  border: "1px solid #ef4444",
  borderRadius: "8px",
  color: "#b91c1c",
  fontSize: "14px",
};