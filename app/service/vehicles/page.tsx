"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

type Vehicle = {
  id: string;
  internal_code: string | null;
  plate_number: string;
  make: string | null;
  model: string | null;
  production_year: number | null;
  color: string | null;
  status: string | null;
  current_mileage: number | null;
};

const statusLabels: Record<string, string> = {
  working: "В работе",
  free: "Свободна",
  service: "СТО",
  accident: "ДТП",
  blocked: "Заблокирована",
  inactive: "Неактивна",
};

const ALLOWED_ROLES = ["director", "administrator", "service_manager"];

export default function ServiceClientVehiclesPage() {
  const router = useRouter();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadVehicles() {
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

      if (!ALLOWED_ROLES.includes(profile.role)) {
        router.replace("/");
        return;
      }

      const { data, error } = await supabase
        .from("vehicles")
        .select(`
          id,
          internal_code,
          plate_number,
          make,
          model,
          production_year,
          color,
          status,
          current_mileage
        `)
        .is("archived_at", null)
        .eq("vehicle_scope", "service_client")
        .order("internal_code", { ascending: true });

      if (error) {
        console.error(error);
        setErrorMessage("Не удалось загрузить автомобили.");
        setLoading(false);
        return;
      }

      setVehicles(data ?? []);
      setLoading(false);
    }

    loadVehicles();
  }, [router]);

  const filteredVehicles = useMemo(() => {
    const searchText = search.trim().toLowerCase();

    return vehicles.filter((vehicle) => {
      const searchableText = [
        vehicle.internal_code,
        vehicle.plate_number,
        vehicle.make,
        vehicle.model,
        vehicle.production_year,
        vehicle.color,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return !searchText || searchableText.includes(searchText);
    });
  }, [vehicles, search]);

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

  return (
    <main style={{ minHeight: "100vh", background: "#f5f6f8", padding: 32 }}>
      <div style={{ maxWidth: 1500, margin: "0 auto" }}>
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

            <h1 style={{ margin: 0, fontSize: 32 }}>Авто клиентов</h1>
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
              onClick={() => router.push("/service")}
              style={navButtonStyle}
            >
              ← Назад
            </button>
          </div>
        </div>

        <div
          style={{
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            color: "#1e3a8a",
            borderRadius: 10,
            padding: 14,
            marginBottom: 18,
            fontSize: 14,
          }}
        >
          Временный раздел: здесь пока просто отдельно собраны автомобили
          внешних клиентов СТО (не входят в арендный парк Partner). Позже
          этот раздел будет доработан вместе с модулем MEDUZA SERVICE.
        </div>

        <div
          style={{
            background: "white",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            padding: 16,
            marginBottom: 18,
          }}
        >
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по номеру, коду, марке, модели, году, цвету"
            style={{
              width: "100%",
              height: 44,
              borderRadius: 8,
              border: "1px solid #d1d5db",
              padding: "0 14px",
              fontSize: 14,
              boxSizing: "border-box",
            }}
          />
        </div>

        {errorMessage && (
          <div
            style={{
              background: "#fee2e2",
              color: "#991b1b",
              border: "1px solid #fecaca",
              borderRadius: 8,
              padding: 14,
              marginBottom: 18,
            }}
          >
            {errorMessage}
          </div>
        )}

        <div
          style={{
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            overflow: "hidden",
            boxShadow: "0 1px 3px rgba(0,0,0,.04)",
          }}
        >
          {filteredVehicles.length === 0 ? (
            <div style={{ padding: 30, color: "#666" }}>
              Автомобилей клиентов пока нет.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  minWidth: 1100,
                }}
              >
                <thead>
                  <tr style={{ background: "#f9fafb" }}>
                    <th style={headerCell}>Код</th>
                    <th style={headerCell}>Гос. номер</th>
                    <th style={headerCell}>Автомобиль</th>
                    <th style={headerCell}>Год</th>
                    <th style={headerCell}>Цвет</th>
                    <th style={headerCell}>Пробег</th>
                    <th style={headerCell}>Статус</th>
                    <th style={headerCell}>Действия</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredVehicles.map((vehicle) => (
                    <tr key={vehicle.id} style={{ borderTop: "1px solid #e5e7eb" }}>
                      <td style={bodyCell}>{vehicle.internal_code || "—"}</td>

                      <td style={{ ...bodyCell, fontWeight: 700 }}>
                        {vehicle.plate_number}
                      </td>

                      <td style={bodyCell}>
                        {[vehicle.make, vehicle.model].filter(Boolean).join(" ") || "—"}
                      </td>

                      <td style={bodyCell}>{vehicle.production_year || "—"}</td>

                      <td style={bodyCell}>{vehicle.color || "—"}</td>

                      <td style={bodyCell}>
                        {(vehicle.current_mileage ?? 0).toLocaleString("ru-RU")} км
                      </td>

                      <td style={bodyCell}>
                        {vehicle.status
                          ? statusLabels[vehicle.status] || vehicle.status
                          : "—"}
                      </td>

                      <td style={bodyCell}>
                        <button
                          type="button"
                          onClick={() => router.push(`/vehicles/${vehicle.id}?from=service`)}
                          style={{
                            height: 36,
                            padding: "0 14px",
                            borderRadius: 7,
                            border: "1px solid #d1d5db",
                            background: "white",
                            cursor: "pointer",
                            fontSize: 13,
                            fontWeight: 600,
                          }}
                        >
                          Открыть
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

const headerCell: React.CSSProperties = {
  textAlign: "left",
  padding: "14px 16px",
  fontSize: 13,
  color: "#555",
  fontWeight: 600,
};

const bodyCell: React.CSSProperties = {
  padding: "15px 16px",
  fontSize: 14,
  color: "#111",
};
