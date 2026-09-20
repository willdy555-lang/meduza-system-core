"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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

export default function ServiceJobViewPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<ServiceJob | null>(null);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    loadPage();
  }, [jobId]);

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
      .eq("id", jobId)
      .single();

    if (error || !data) {
      console.error(error);
      setErrorText("Не удалось загрузить работу.");
      setLoading(false);
      return;
    }

    setJob(data);
    setLoading(false);
  }

  if (loading) {
    return <main style={loadingStyle}>Загрузка...</main>;
  }

  if (!job) {
    return (
      <main style={pageStyle}>
        <div style={containerStyle}>
          <div style={headerStyle}>
            <div>
              <div style={systemTitleStyle}>MEDUZA SYSTEM</div>
              <h1 style={titleStyle}>Работа</h1>
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
                onClick={() => router.push("/service/works")}
                style={secondaryButtonStyle}
              >
                ← Назад
              </button>
            </div>
          </div>

          <div style={errorStyle}>{errorText || "Работа не найдена."}</div>
        </div>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <div style={headerStyle}>
          <div>
            <div style={systemTitleStyle}>MEDUZA SYSTEM</div>
            <h1 style={titleStyle}>Просмотр работы</h1>
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
              onClick={() => router.push("/service/works")}
              style={secondaryButtonStyle}
            >
              ← Назад
            </button>

            <button
              type="button"
              onClick={() => router.push(`/service/works/${jobId}/edit`)}
              style={editButtonStyle}
            >
              Редактировать
            </button>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={twoColumnGridStyle}>
            <ViewField label="Код работы" value={job.internal_code} />
            <ViewField label="Название" value={job.name} />
          </div>

          <ViewField
            label="Цена"
            value={job.price.toFixed(2)}
          />

          <div style={{ marginTop: 20 }}>
            <ViewField label="Описание" value={job.description} />
          </div>
        </div>
      </div>
    </main>
  );
}

function ViewField({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      <div style={valueStyle}>{value || "—"}</div>
    </div>
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
  maxWidth: "1200px",
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

const headerButtonsStyle: React.CSSProperties = {
  display: "flex",
  gap: "10px",
};

const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  padding: "24px",
};

const twoColumnGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "20px",
  marginBottom: "20px",
};

const labelStyle: React.CSSProperties = {
  marginBottom: "7px",
  fontSize: "13px",
  fontWeight: 600,
  color: "#6b7280",
};

const valueStyle: React.CSSProperties = {
  minHeight: "42px",
  display: "flex",
  alignItems: "center",
  padding: "0 12px",
  border: "1px solid #e5e7eb",
  borderRadius: "8px",
  background: "#f9fafb",
  fontSize: "14px",
  color: "#111827",
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

const editButtonStyle: React.CSSProperties = {
  height: "42px",
  padding: "0 16px",
  border: "none",
  borderRadius: "8px",
  background: "#2563eb",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
};

const errorStyle: React.CSSProperties = {
  marginTop: "20px",
  padding: "12px 14px",
  border: "1px solid #ef4444",
  borderRadius: "8px",
  background: "#ffffff",
  color: "#b91c1c",
  fontSize: "14px",
};
