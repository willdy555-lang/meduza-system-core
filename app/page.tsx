"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

export default function HomePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState("");
  const [fullName, setFullName] = useState("");

  useEffect(() => {
    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role, active, full_name")
        .eq("id", user.id)
        .single();

      if (error || !profile || !profile.active) {
        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }

      if (profile.role === "vehicle_owner") {
        router.replace("/owner");
        return;
      }

      if (profile.role === "rental_manager") {
        router.replace("/partner");
        return;
      }

      setRole(profile.role);
      setFullName(profile.full_name || "");
      setLoading(false);
    }

    loadUser();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  function getRoleName() {
    switch (role) {
      case "director":
        return "Director";
      case "administrator":
        return "Administrator";
      case "rental_manager":
        return "Rental Manager";
      case "service_manager":
        return "Service Manager";
      case "driver":
        return "Driver";
      case "vehicle_owner":
        return "Vehicle Owner";
      default:
        return role;
    }
  }

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
          color: "#222",
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
          maxWidth: "1400px",
          margin: "0 auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "32px",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "14px",
                color: "#6b7280",
                marginBottom: "6px",
                letterSpacing: "0.04em",
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
              Главное меню
            </h1>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: "10px",
            }}
          >
            <div
              style={{
                fontSize: "16px",
                fontWeight: 600,
                color: "#111827",
              }}
            >
              {fullName ? `${fullName} · ${getRoleName()}` : getRoleName()}
            </div>

            <button
              type="button"
              onClick={handleLogout}
              style={{
                height: "42px",
                padding: "0 18px",
                borderRadius: "8px",
                border: "1px solid #d1d5db",
                background: "#ffffff",
                color: "#111827",
                fontSize: "14px",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Выйти
            </button>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: "20px",
          }}
        >
          <MenuCard
            title="MEDUZA PARTNER"
            onClick={() => router.push("/partner")}
          />

          <MenuCard
            title="MEDUZA SERVICE"
            onClick={() => router.push("/service")}
          />

          {role === "director" && (
            <MenuCard
              title="Пользователи"
              onClick={() => router.push("/users")}
            />
          )}

          {role === "director" && (
            <MenuCard
              title="Задачи"
              onClick={() => router.push("/tasks")}
            />
          )}
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
    <button
      type="button"
      onClick={onClick}
      style={{
        minHeight: "170px",
        background: "#ffffff",
        border: "1px solid #dfe3e8",
        borderRadius: "12px",
        padding: "28px",
        cursor: "pointer",
        textAlign: "left",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        transition: "0.15s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "#b8bec7";
        e.currentTarget.style.boxShadow =
          "0 4px 12px rgba(0,0,0,0.06)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "#dfe3e8";
        e.currentTarget.style.boxShadow =
          "0 1px 3px rgba(0,0,0,0.04)";
      }}
    >
      <div
        style={{
          fontSize: "24px",
          fontWeight: 700,
          color: "#111827",
        }}
      >
        {title}
      </div>
    </button>
  );
}