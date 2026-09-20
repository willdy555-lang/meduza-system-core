"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

const ALLOWED_ROLES = ["director", "administrator", "service_manager"];

export default function ServicePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAccess() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role, active")
        .eq("id", user.id)
        .single();

      if (error || !profile || !profile.active) {
        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }

      if (!ALLOWED_ROLES.includes(profile.role)) {
        router.replace("/");
        return;
      }

      setLoading(false);
    }

    checkAccess();
  }, [router]);

  if (loading) {
    return <main style={loadingStyle}>Загрузка...</main>;
  }

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <div style={headerStyle}>
          <div>
            <div style={systemTitleStyle}>MEDUZA SYSTEM</div>
            <h1 style={titleStyle}>MEDUZA SERVICE</h1>
          </div>

          <div style={headerButtonsStyle}>
            <button
              type="button"
              onClick={() => router.push("/")}
              style={secondaryButtonStyle}
            >
              Главное меню
            </button>
          </div>
        </div>

        <div style={gridStyle}>
          <MenuCard
            title="Склад"
            onClick={() => router.push("/service/products")}
          />

          <MenuCard
            title="Работы"
            onClick={() => router.push("/service/works")}
          />

          <MenuCard
            title="Автомобили клиентов"
            onClick={() => router.push("/service/vehicles")}
          />
        </div>
      </div>
    </main>
  );
}

function MenuCard({
  title,
  onClick,
}: {
  title: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} style={cardStyle}>
      <div style={cardTitleStyle}>{title}</div>
    </button>
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
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "32px",
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

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: "20px",
};

const cardStyle: React.CSSProperties = {
  minHeight: "170px",
  background: "#ffffff",
  border: "1px solid #dfe3e8",
  borderRadius: "12px",
  padding: "28px",
  cursor: "pointer",
  textAlign: "left",
  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: 700,
  color: "#111827",
};
