"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

type Vehicle = {
  id: string;
  plate_number: string;
  make: string | null;
  model: string | null;
};

type VehicleEvent = {
  id: string;
  event_type: string;
  title: string;
  description: string | null;
  actor_id: string | null;
  created_at: string;
};

type Profile = {
  id: string;
  full_name: string | null;
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  rental_started: "Аренда",
  rental_day_adjustment: "Аренда",
  rental_ended: "Аренда",
  rental_deleted: "Аренда",
  mileage_entry: "Пробег",
  maintenance_item_added: "ТО",
  maintenance_done: "ТО",
  maintenance_item_deleted: "ТО",
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function VehicleHistoryPage() {
  return (
    <Suspense fallback={<main style={{ padding: 32 }}>Загрузка...</main>}>
      <VehicleHistoryPageInner />
    </Suspense>
  );
}

function VehicleHistoryPageInner() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const vehicleId = params.id as string;
  // См. app/vehicles/[id]/page.tsx — та же логика "машина клиента СТО".
  const fromService = searchParams.get("from") === "service";
  const backSuffix = fromService ? "?from=service" : "";

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [events, setEvents] = useState<VehicleEvent[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setErrorMessage("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, active")
        .eq("id", user.id)
        .single();

      if (!profile || !profile.active) {
        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }

      if (profile.role === "vehicle_owner") {
        router.replace("/owner");
        return;
      }

      const { data: vehicleData, error: vehicleError } = await supabase
        .from("vehicles")
        .select("id, plate_number, make, model")
        .eq("id", vehicleId)
        .single();

      if (vehicleError || !vehicleData) {
        setErrorMessage("Не удалось загрузить автомобиль.");
        setLoading(false);
        return;
      }

      setVehicle(vehicleData);

      const { data: eventData, error: eventError } = await supabase
        .from("vehicle_events")
        .select("id, event_type, title, description, actor_id, created_at")
        .eq("vehicle_id", vehicleId)
        .order("created_at", { ascending: false });

      if (eventError) {
        console.error(eventError);
        setErrorMessage("Не удалось загрузить историю событий.");
        setLoading(false);
        return;
      }

      const rows = eventData ?? [];
      setEvents(rows);

      const userIds = Array.from(
        new Set(
          rows
            .map((item) => item.actor_id)
            .filter((value): value is string => Boolean(value))
        )
      );

      if (userIds.length > 0) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);

        const profileMap: Record<string, string> = {};

        (profileData as Profile[] | null)?.forEach((profile) => {
          profileMap[profile.id] = profile.full_name || "—";
        });

        setProfiles(profileMap);
      }

      setLoading(false);
    }

    if (vehicleId) {
      loadData();
    }
  }, [vehicleId, router]);

  const navButtonStyle = {
    height: 44,
    padding: "0 18px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    background: "white",
    cursor: "pointer",
    fontSize: 14,
  };

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", background: "#f5f6f8", padding: 32 }}>
        Загрузка...
      </main>
    );
  }

  if (errorMessage || !vehicle) {
    return (
      <main style={{ minHeight: "100vh", background: "#f5f6f8", padding: 32 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
            <button
              type="button"
              onClick={() => router.push("/")}
              style={navButtonStyle}
            >
              Главное меню
            </button>

            <button
              type="button"
              onClick={() => router.push(`/vehicles/${vehicleId}${backSuffix}`)}
              style={navButtonStyle}
            >
              ← Назад
            </button>
          </div>

          <div
            style={{
              background: "white",
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: 24,
            }}
          >
            {errorMessage || "Автомобиль не найден."}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f5f6f8", padding: 32 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div>
            <div style={{ fontSize: 14, color: "#777", marginBottom: 6 }}>
              MEDUZA SYSTEM
            </div>

            <h1 style={{ margin: 0, fontSize: 32 }}>История событий</h1>

            <div style={{ marginTop: 6, color: "#666", fontSize: 16 }}>
              {vehicle.plate_number} ·{" "}
              {[vehicle.make, vehicle.model].filter(Boolean).join(" ")}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={() => router.push("/")}
              style={navButtonStyle}
            >
              Главное меню
            </button>

            <button
              type="button"
              onClick={() => router.push(`/vehicles/${vehicleId}${backSuffix}`)}
              style={navButtonStyle}
            >
              ← Назад
            </button>
          </div>
        </div>

        <div
          style={{
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            overflow: "hidden",
            boxShadow: "0 1px 3px rgba(0,0,0,.04)",
          }}
        >
          {events.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "#999" }}>
              По этому автомобилю пока нет ни одного события.
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Дата</th>
                  <th style={thStyle}>Раздел</th>
                  <th style={thStyle}>Событие</th>
                  <th style={thStyle}>Подробности</th>
                  <th style={thStyle}>Кто</th>
                </tr>
              </thead>

              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td style={tdStyle}>{formatDateTime(event.created_at)}</td>
                    <td style={{ ...tdStyle, color: "#6b7280" }}>
                      {EVENT_TYPE_LABELS[event.event_type] || "—"}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>
                      {event.title}
                    </td>
                    <td style={tdStyle}>{event.description || "—"}</td>
                    <td style={{ ...tdStyle, color: "#6b7280" }}>
                      {event.actor_id
                        ? profiles[event.actor_id] || "—"
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ marginTop: 14, fontSize: 13, color: "#9ca3af" }}>
          Здесь фиксируются ключевые события по автомобилю: открытие и
          завершение аренды, списание дней, внесение пробега, работы по ТО.
          Записи не редактируются и не удаляются.
        </div>
      </div>
    </main>
  );
}

const thStyle: React.CSSProperties = {
  padding: "12px 16px",
  textAlign: "left",
  background: "#f9fafb",
  borderBottom: "1px solid #e5e7eb",
  fontSize: 12,
  fontWeight: 600,
  color: "#6b7280",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 16px",
  textAlign: "left",
  borderBottom: "1px solid #f0f1f3",
  fontSize: 14,
};
