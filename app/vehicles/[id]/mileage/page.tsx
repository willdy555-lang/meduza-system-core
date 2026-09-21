"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
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
  current_mileage: number | null;
};

type MileageEntry = {
  id: string;
  mileage: number;
  recorded_at: string;
  entered_by: string | null;
  source: string | null;
  entry_type: string | null;
  note: string | null;
};

type Profile = {
  id: string;
  full_name: string | null;
};

const entryTypeLabels: Record<string, string> = {
  initial: "Первичный",
  weekly: "Еженедельный",
  manual: "Ручной",
  service: "СТО",
};

export default function MileageHistoryPage() {
  return (
    <Suspense fallback={<main style={{ padding: 32 }}>Загрузка...</main>}>
      <MileageHistoryPageInner />
    </Suspense>
  );
}

function MileageHistoryPageInner() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const vehicleId = params.id as string;
  // См. app/vehicles/[id]/page.tsx — та же логика "машина клиента СТО".
  const fromService = searchParams.get("from") === "service";
  const backSuffix = fromService ? "?from=service" : "";

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [entries, setEntries] = useState<MileageEntry[]>([]);
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
        .select("id, plate_number, make, model, current_mileage")
        .eq("id", vehicleId)
        .single();

      if (vehicleError || !vehicleData) {
        setErrorMessage("Не удалось загрузить автомобиль.");
        setLoading(false);
        return;
      }

      setVehicle(vehicleData);

      const { data: mileageData, error: mileageError } = await supabase
        .from("mileage_entries")
        .select(
          "id, mileage, recorded_at, entered_by, source, entry_type, note"
        )
        .eq("vehicle_id", vehicleId)
        .order("recorded_at", { ascending: false });

      if (mileageError) {
        console.error(mileageError);
        setErrorMessage("Не удалось загрузить историю пробега.");
        setLoading(false);
        return;
      }

      const rows = mileageData ?? [];
      setEntries(rows);

      const userIds = Array.from(
        new Set(
          rows
            .map((item) => item.entered_by)
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

  const initialMileage = useMemo(() => {
    const initial = [...entries]
      .filter((item) => item.entry_type === "initial")
      .sort(
        (a, b) =>
          new Date(a.recorded_at).getTime() -
          new Date(b.recorded_at).getTime()
      )[0];

    return initial?.mileage ?? null;
  }, [entries]);

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

  if (errorMessage || !vehicle) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#f5f6f8",
          padding: 32,
        }}
      >
        <div style={{ maxWidth: 1400, margin: "0 auto" }}>
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
    <main
      style={{
        minHeight: "100vh",
        background: "#f5f6f8",
        padding: 32,
      }}
    >
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
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

            <h1 style={{ margin: 0, fontSize: 32 }}>
              История пробега
            </h1>

            <div
              style={{
                marginTop: 6,
                color: "#666",
                fontSize: 16,
              }}
            >
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

            <button
              type="button"
              onClick={() =>
                router.push(`/vehicles/${vehicleId}/mileage/new`)
              }
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
              + Добавить пробег
            </button>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
            marginBottom: 20,
          }}
        >
          <SummaryCard
            title="Текущий пробег"
            value={`${(vehicle.current_mileage ?? 0).toLocaleString(
              "ru-RU"
            )} км`}
          />

          <SummaryCard
            title="Первичный пробег"
            value={
              initialMileage !== null
                ? `${initialMileage.toLocaleString("ru-RU")} км`
                : "Не указан"
            }
          />

          <SummaryCard
            title="Записей в истории"
            value={String(entries.length)}
          />
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
          {entries.length === 0 ? (
            <div
              style={{
                padding: 30,
                color: "#666",
              }}
            >
              История пробега пока пустая.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  minWidth: 900,
                }}
              >
                <thead>
                  <tr style={{ background: "#f9fafb" }}>
                    <th style={headerCell}>Дата</th>
                    <th style={headerCell}>Пробег</th>
                    <th style={headerCell}>Тип</th>
                    <th style={headerCell}>Кто внес</th>
                    <th style={headerCell}>Комментарий</th>
                  </tr>
                </thead>

                <tbody>
                  {entries.map((entry) => (
                    <tr
                      key={entry.id}
                      style={{
                        borderTop: "1px solid #e5e7eb",
                      }}
                    >
                      <td style={bodyCell}>
                        {new Date(entry.recorded_at).toLocaleString(
                          "ru-RU"
                        )}
                      </td>

                      <td
                        style={{
                          ...bodyCell,
                          fontWeight: 700,
                        }}
                      >
                        {entry.mileage.toLocaleString("ru-RU")} км
                      </td>

                      <td style={bodyCell}>
                        {entry.entry_type
                          ? entryTypeLabels[entry.entry_type] ||
                            entry.entry_type
                          : "—"}
                      </td>

                      <td style={bodyCell}>
                        {entry.entered_by
                          ? profiles[entry.entered_by] || "—"
                          : "—"}
                      </td>

                      <td style={bodyCell}>
                        {entry.note || "—"}
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

function SummaryCard({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div
      style={{
        background: "white",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 20,
        boxShadow: "0 1px 3px rgba(0,0,0,.04)",
      }}
    >
      <div
        style={{
          color: "#666",
          fontSize: 14,
          marginBottom: 8,
        }}
      >
        {title}
      </div>

      <div
        style={{
          fontSize: 24,
          fontWeight: 700,
        }}
      >
        {value}
      </div>
    </div>
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