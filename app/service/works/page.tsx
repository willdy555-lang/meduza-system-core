"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

const ALLOWED_ROLES = ["director", "administrator", "service_manager"];

type ServiceJob = {
  id: string;
  internal_code: string;
  name: string;
  price: number;
  description: string | null;
};

export default function ServiceWorksPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<ServiceJob[]>([]);
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

    if (!ALLOWED_ROLES.includes(profile.role)) {
      router.replace("/");
      return;
    }

    const { data, error } = await supabase
      .from("service_jobs")
      .select("id, internal_code, name, price, description")
      .is("archived_at", null)
      .order("name", { ascending: true });

    if (error) {
      console.error(error);
      setErrorText("Не удалось загрузить список работ.");
      setLoading(false);
      return;
    }

    setJobs(data ?? []);
    setLoading(false);
  }

  const filteredJobs = useMemo(() => {
    const value = search.trim().toLowerCase();
    if (!value) return jobs;

    return jobs.filter((job) => {
      const name = job.name.toLowerCase();
      const code = job.internal_code.toLowerCase();

      return name.includes(value) || code.includes(value);
    });
  }, [jobs, search]);

  if (loading) {
    return <main style={loadingStyle}>Загрузка...</main>;
  }

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <div style={headerStyle}>
          <div>
            <div style={systemTitleStyle}>MEDUZA SYSTEM</div>
            <h1 style={titleStyle}>Работы</h1>
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
              onClick={() => router.push("/service")}
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
            placeholder="Поиск по названию или коду"
            style={searchInputStyle}
          />

          <button
            type="button"
            onClick={() => router.push("/service/works/new")}
            style={primaryButtonStyle}
          >
            + Добавить работу
          </button>
        </div>

        {errorText && <div style={errorStyle}>{errorText}</div>}

        <div style={tableWrapperStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={headerCellStyle}>Код</th>
                <th style={headerCellStyle}>Название</th>
                <th style={headerCellStyle}>Цена</th>
                <th style={headerCellStyle}>Действия</th>
              </tr>
            </thead>

            <tbody>
              {filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan={4} style={emptyStyle}>
                    {search
                      ? "По вашему запросу ничего не найдено."
                      : "Работ пока нет."}
                  </td>
                </tr>
              ) : (
                filteredJobs.map((job) => (
                  <tr key={job.id}>
                    <td style={bodyCellStyle}>{job.internal_code}</td>

                    <td style={{ ...bodyCellStyle, fontWeight: 600 }}>
                      {job.name}
                    </td>

                    <td style={bodyCellStyle}>{job.price.toFixed(2)}</td>

                    <td style={bodyCellStyle}>
                      <div style={{ display: "flex", gap: 10 }}>
                        <button
                          type="button"
                          onClick={() =>
                            router.push(`/service/works/${job.id}`)
                          }
                          style={rowButtonStyle}
                        >
                          Просмотр
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            router.push(`/service/works/${job.id}/edit`)
                          }
                          style={rowButtonStyle}
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

        <div style={countStyle}>Работ: {filteredJobs.length}</div>
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
  flexWrap: "wrap",
};

const searchInputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: "220px",
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
  whiteSpace: "nowrap",
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
};

const headerCellStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "14px 18px",
  background: "#f9fafb",
  borderBottom: "1px solid #e5e7eb",
  fontSize: "13px",
  fontWeight: 600,
  color: "#4b5563",
};

const bodyCellStyle: React.CSSProperties = {
  padding: "14px 18px",
  borderBottom: "1px solid #eeeeee",
  fontSize: "14px",
  color: "#111827",
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
