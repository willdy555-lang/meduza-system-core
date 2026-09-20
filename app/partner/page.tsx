"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

type DocAlert = {
  vehicleId: string;
  vehicleLabel: string;
  docLabel: string;
  statusLabel: string;
  color: string;
  bg: string;
  sortKey: number;
};

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((target.getTime() - today.getTime()) / msPerDay);
}

function buildAlert(
  vehicleId: string,
  vehicleLabel: string,
  docLabel: string,
  dateStr: string | null
): DocAlert | null {
  if (!dateStr) {
    return {
      vehicleId,
      vehicleLabel,
      docLabel,
      statusLabel: "Дата не указана",
      color: "#991b1b",
      bg: "#fee2e2",
      sortKey: -999999,
    };
  }

  const days = daysUntil(dateStr);

  if (days > 30) {
    return null;
  }

  if (days < 0) {
    return {
      vehicleId,
      vehicleLabel,
      docLabel,
      statusLabel: `Просрочено (${Math.abs(days)} дн. назад)`,
      color: "#991b1b",
      bg: "#fee2e2",
      sortKey: days,
    };
  }

  return {
    vehicleId,
    vehicleLabel,
    docLabel,
    statusLabel: `Осталось ${days} дн.`,
    color: "#92400e",
    bg: "#fef3c7",
    sortKey: days,
  };
}

export default function PartnerPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [canSeeReport, setCanSeeReport] = useState(false);
  const [canSeeOwners, setCanSeeOwners] = useState(true);
  const [alerts, setAlerts] = useState<DocAlert[]>([]);
  const [role, setRole] = useState("");
  const [fullName, setFullName] = useState("");

  useEffect(() => {
    checkAccess();
  }, []);

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

    setCanSeeReport(["director", "administrator"].includes(profile.role));
    setCanSeeOwners(profile.role !== "rental_manager");
    setRole(profile.role);
    setFullName(profile.full_name || "");

    const { data: vehicles } = await supabase
      .from("vehicles")
      .select(
        "id, plate_number, make, model, status, insurance_expires_at, inspection_expires_at"
      )
      .neq("status", "inactive")
      .is("archived_at", null);

    const collected: DocAlert[] = [];

    (vehicles ?? []).forEach((vehicle) => {
      const label = `${vehicle.plate_number} · ${[vehicle.make, vehicle.model]
        .filter(Boolean)
        .join(" ")}`;

      const insuranceAlert = buildAlert(
        vehicle.id,
        label,
        "Страховка",
        vehicle.insurance_expires_at
      );
      if (insuranceAlert) collected.push(insuranceAlert);

      const inspectionAlert = buildAlert(
        vehicle.id,
        label,
        "Техосмотр",
        vehicle.inspection_expires_at
      );
      if (inspectionAlert) collected.push(inspectionAlert);
    });

    collected.sort((a, b) => a.sortKey - b.sortKey);

    setAlerts(collected);
    setLoading(false);
  }

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
          color: "#111827",
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
        {/* ШАПКА */}

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
              MEDUZA PARTNER
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
                fontSize: "14px",
                fontWeight: 600,
                color: "#111827",
              }}
            >
              {fullName ? `${fullName} · ${getRoleName()}` : getRoleName()}
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
                onClick={handleLogout}
                style={secondaryButtonStyle}
              >
                Выйти
              </button>
            </div>
          </div>
        </div>

        {/* УВЕДОМЛЕНИЯ ПО СРОКАМ ДОКУМЕНТОВ */}

        {alerts.length > 0 && (
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #dfe3e8",
              borderRadius: "12px",
              padding: "20px 24px",
              marginBottom: "24px",
            }}
          >
            <div
              style={{
                fontSize: "14px",
                fontWeight: 700,
                color: "#111827",
                marginBottom: "14px",
              }}
            >
              Истекают сроки документов ({alerts.length})
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              {alerts.map((alert, index) => (
                <button
                  key={`${alert.vehicleId}-${alert.docLabel}-${index}`}
                  type="button"
                  onClick={() =>
                    router.push(`/vehicles/${alert.vehicleId}/documents`)
                  }
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "12px",
                    width: "100%",
                    textAlign: "left",
                    border: "none",
                    borderRadius: "8px",
                    padding: "10px 14px",
                    background: alert.bg,
                    cursor: "pointer",
                  }}
                >
                  <span style={{ fontSize: "14px", color: "#111827" }}>
                    {alert.vehicleLabel} — {alert.docLabel}
                  </span>

                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: 700,
                      color: alert.color,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {alert.statusLabel}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* РАЗДЕЛЫ */}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: "20px",
          }}
        >
          <MenuCard
            title="Автомобили"
            onClick={() => router.push("/vehicles")}
          />

          {canSeeOwners && (
            <MenuCard
              title="Собственники"
              onClick={() => router.push("/owners")}
            />
          )}

          <MenuCard
            title="Водители"
            onClick={() => router.push("/drivers")}
          />

          <MenuCard
            title="Аренда"
            onClick={() => router.push("/rent")}
          />

          <MenuCard
            title="Пробеги"
            onClick={() => router.push("/mileage")}
          />

          {canSeeReport && (
            <MenuCard
              title="Отчёт по аренде"
              onClick={() => router.push("/rent/report")}
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
