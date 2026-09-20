"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  owner_id: string | null;
};

const statusLabels: Record<string, string> = {
  working: "В работе",
  free: "Свободные",
  service: "СТО",
  accident: "ДТП",
  blocked: "Заблокированные",
  inactive: "Неактивные",
};

export default function VehiclesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const statusFromUrl = searchParams.get("status") || "";

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({});
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(statusFromUrl);
  const [errorMessage, setErrorMessage] = useState("");

  const isFilteredPage = Boolean(statusFromUrl);
  // Общий (сводный) список по всем автомобилям — код/собственник/номер и
  // далее как обычно — виден только директору. У остальных ролей список
  // остаётся прежним: только автопарк Partner, без колонки "Собственник".
  const isDirector = role === "director";

  useEffect(() => {
    setStatusFilter(statusFromUrl);
  }, [statusFromUrl]);

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

      if (profile.role === "vehicle_owner") {
        router.replace("/owner");
        return;
      }

      setRole(profile.role);

      // Этот список — только автопарк Partner (машины клиентов СТО сюда не
      // попадают, у них отдельный раздел "Автомобили клиентов" в MEDUZA
      // SERVICE). Для директора дополнительно показываем колонку "Собственник".
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
          current_mileage,
          owner_id
        `)
        .is("archived_at", null)
        .eq("vehicle_scope", "partner")
        .order("internal_code", { ascending: true });

      if (error) {
        console.error(
          "Ошибка загрузки автомобилей:",
          error.message,
          error.details,
          error.hint,
          error.code
        );
        setErrorMessage(
          "Не удалось загрузить автомобили. " +
            (error.message || error.details || error.hint || "Неизвестная ошибка (код: " + (error.code || "—") + ").")
        );
        setLoading(false);
        return;
      }

      setVehicles(data ?? []);

      const ownerIds = Array.from(
        new Set(
          (data ?? [])
            .map((v) => v.owner_id)
            .filter((id): id is string => Boolean(id))
        )
      );

      if (ownerIds.length > 0) {
        const { data: ownersData, error: ownersError } = await supabase
          .from("vehicle_owners")
          .select("id, name")
          .in("id", ownerIds);

        if (ownersError) {
          console.error(
            "Ошибка загрузки собственников:",
            ownersError.message,
            ownersError.details,
            ownersError.hint,
            ownersError.code
          );
        }

        const namesMap: Record<string, string> = {};
        (ownersData ?? []).forEach((o) => {
          namesMap[o.id] = o.name;
        });
        setOwnerNames(namesMap);
      }

      setLoading(false);
    }

    loadVehicles();
  }, [router]);

  const filteredVehicles = useMemo(() => {
    const searchText = search.trim().toLowerCase();

    return vehicles.filter((vehicle) => {
      const matchesStatus =
        !statusFilter || vehicle.status === statusFilter;

      const searchableText = [
        vehicle.internal_code,
        vehicle.plate_number,
        vehicle.make,
        vehicle.model,
        vehicle.production_year,
        vehicle.color,
        vehicle.owner_id ? ownerNames[vehicle.owner_id] : null,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        !searchText || searchableText.includes(searchText);

      return matchesStatus && matchesSearch;
    });
  }, [vehicles, search, statusFilter, ownerNames]);

  const pageTitle = statusFromUrl
    ? statusLabels[statusFromUrl] || "Автомобили"
    : "Автомобили";

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
      <main
        style={{
          minHeight: "100vh",
          background: "#f5f6f8",
          padding: 32,
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
        background: "#f5f6f8",
        padding: 32,
      }}
    >
      <div
        style={{
          maxWidth: 1500,
          margin: "0 auto",
        }}
      >
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
            <div
              style={{
                fontSize: 14,
                color: "#777",
                marginBottom: 6,
              }}
            >
              MEDUZA SYSTEM
            </div>

            <h1
              style={{
                margin: 0,
                fontSize: 32,
              }}
            >
              {pageTitle}
            </h1>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
            }}
          >
            <button
              type="button"
              onClick={() => router.push("/")}
              style={navButtonStyle}
            >
              Главное меню
            </button>

            <button
              type="button"
              onClick={() => router.push("/partner")}
              style={navButtonStyle}
            >
              ← Назад
            </button>

            {!isFilteredPage && (
              <button
                type="button"
                onClick={() => router.push("/vehicles/new")}
                style={{
                  height: 44,
                  padding: "0 18px",
                  borderRadius: 8,
                  border: "none",
                  background: "#2563eb",
                  color: "white",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                + Добавить автомобиль
              </button>
            )}
          </div>
        </div>

        <div
          style={{
            background: "white",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            padding: 16,
            marginBottom: 18,
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по номеру, коду, марке, модели, году, цвету"
            style={{
              flex: "1 1 420px",
              height: 44,
              borderRadius: 8,
              border: "1px solid #d1d5db",
              padding: "0 14px",
              fontSize: 14,
            }}
          />

          {!isFilteredPage && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                minWidth: 220,
                height: 44,
                borderRadius: 8,
                border: "1px solid #d1d5db",
                padding: "0 12px",
                background: "white",
                fontSize: 14,
              }}
            >
              <option value="">Все статусы</option>
              <option value="working">В работе</option>
              <option value="free">Свободные</option>
              <option value="service">СТО</option>
              <option value="accident">ДТП</option>
              <option value="blocked">Заблокированные</option>
              <option value="inactive">Неактивные</option>
            </select>
          )}
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
            marginBottom: 12,
            fontSize: 13,
            color: "#6b7280",
          }}
        >
          Всего автомобилей: {vehicles.length}
          {search || statusFilter ? ` (показано: ${filteredVehicles.length})` : ""}
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
          {filteredVehicles.length === 0 ? (
            <div
              style={{
                padding: 30,
                color: "#666",
              }}
            >
              Автомобили не найдены.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  minWidth: isFilteredPage ? 750 : 1100,
                }}
              >
                <thead>
                  <tr style={{ background: "#f9fafb" }}>
                    {!isFilteredPage && (
                      <th style={headerCell}>Код</th>
                    )}

                    {!isFilteredPage && isDirector && (
                      <th style={headerCell}>Собственник</th>
                    )}

                    <th style={headerCell}>Гос. номер</th>
                    <th style={headerCell}>Автомобиль</th>
                    <th style={headerCell}>Год</th>
                    <th style={headerCell}>Цвет</th>
                    <th style={headerCell}>Пробег</th>

                    {!isFilteredPage && (
                      <>
                        <th style={headerCell}>Статус</th>
                        <th style={headerCell}>Действия</th>
                      </>
                    )}
                  </tr>
                </thead>

                <tbody>
                  {filteredVehicles.map((vehicle) => (
                    <tr
                      key={vehicle.id}
                      style={{
                        borderTop: "1px solid #e5e7eb",
                      }}
                    >
                      {!isFilteredPage && (
                        <td style={bodyCell}>
                          {vehicle.internal_code || "—"}
                        </td>
                      )}

                      {!isFilteredPage && isDirector && (
                        <td style={bodyCell}>
                          {(vehicle.owner_id && ownerNames[vehicle.owner_id]) || "—"}
                        </td>
                      )}

                      <td
                        style={{
                          ...bodyCell,
                          fontWeight: 700,
                        }}
                      >
                        {vehicle.plate_number}
                      </td>

                      <td style={bodyCell}>
                        {[vehicle.make, vehicle.model]
                          .filter(Boolean)
                          .join(" ") || "—"}
                      </td>

                      <td style={bodyCell}>
                        {vehicle.production_year || "—"}
                      </td>

                      <td style={bodyCell}>
                        {vehicle.color || "—"}
                      </td>

                      <td style={bodyCell}>
                        {(vehicle.current_mileage ?? 0).toLocaleString(
                          "ru-RU"
                        )}{" "}
                        км
                      </td>

                      {!isFilteredPage && (
                        <>
                          <td style={bodyCell}>
                            {vehicle.status
                              ? statusLabels[vehicle.status] ||
                                vehicle.status
                              : "—"}
                          </td>

                          <td style={bodyCell}>
                            <button
                              type="button"
                              onClick={() =>
                                router.push(`/vehicles/${vehicle.id}`)
                              }
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
                        </>
                      )}
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