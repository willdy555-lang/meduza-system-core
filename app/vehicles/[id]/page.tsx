"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

type Vehicle = {
  id: string;
  internal_code: string | null;
  plate_number: string;
  vin: string;
  make: string | null;
  model: string | null;
  production_year: number | null;
  fuel_type: string | null;
  color: string | null;
  current_mileage: number | null;
  status: string | null;
  owner_id: string | null;
  notes: string | null;
  insurance_expires_at: string | null;
  inspection_expires_at: string | null;
};

type Owner = {
  id: string;
  name: string;
};

const statusLabels: Record<string, string> = {
  free: "Свободна",
  working: "В работе",
  service: "СТО",
  accident: "ДТП",
  blocked: "Заблокирована",
  inactive: "Неактивна",
};

const fuelLabels: Record<string, string> = {
  hybrid: "Гибрид",
  petrol: "Бензин",
  petrol_lpg: "Бензин/Газ",
  diesel: "Дизель",
  electric: "Электро",
  lpg: "Газ / LPG",
};

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((target.getTime() - today.getTime()) / msPerDay);
}

function formatDate(dateStr: string) {
  const [year, month, day] = dateStr.split("-");
  return `${day}.${month}.${year}`;
}

function docStatus(
  dateStr: string | null
): { text: string; color: string | undefined } {
  if (!dateStr) {
    return { text: "Дата не указана", color: "#dc2626" };
  }

  const days = daysUntil(dateStr);
  const dateLabel = formatDate(dateStr);

  if (days < 0) {
    return { text: "ПРОСРОЧЕНО", color: "#dc2626" };
  }

  if (days <= 7) {
    return {
      text: `${dateLabel} — осталось ${days} дн.`,
      color: "#dc2626",
    };
  }

  if (days <= 30) {
    return {
      text: `${dateLabel} — осталось ${days} дн.`,
      color: "#b45309",
    };
  }

  return { text: dateLabel, color: undefined };
}

export default function VehicleDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const vehicleId = params.id as string;
  // Машина клиента СТО открыта из раздела MEDUZA SERVICE ("Автомобили клиентов") —
  // запоминаем это через ?from=service, чтобы "Назад" и переходы на под-страницы
  // (Редактировать/Документы/История/Пробег) возвращали именно туда, а не в общий
  // список автопарка Partner.
  const fromService = searchParams.get("from") === "service";
  const backSuffix = fromService ? "?from=service" : "";

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [owner, setOwner] = useState<Owner | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [role, setRole] = useState("");

  useEffect(() => {
    async function loadVehicle() {
      setLoading(true);
      setErrorMessage("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      const fetchedRole = profileData?.role || "";
      setRole(fetchedRole);

      if (fetchedRole === "vehicle_owner") {
        router.replace("/owner");
        return;
      }

      const { data: vehicleData, error: vehicleError } = await supabase
        .from("vehicles")
        .select(`
          id,
          internal_code,
          plate_number,
          vin,
          make,
          model,
          production_year,
          fuel_type,
          color,
          current_mileage,
          status,
          owner_id,
          notes,
          insurance_expires_at,
          inspection_expires_at
        `)
        .eq("id", vehicleId)
        .single();

      if (vehicleError || !vehicleData) {
        console.error(vehicleError);
        setErrorMessage("Не удалось загрузить автомобиль.");
        setLoading(false);
        return;
      }

      setVehicle(vehicleData);

      if (vehicleData.owner_id) {
        const { data: ownerData, error: ownerError } = await supabase
          .from("vehicle_owners")
          .select("id, name")
          .eq("id", vehicleData.owner_id)
          .single();

        if (!ownerError && ownerData) {
          setOwner(ownerData);
        }
      }

      setLoading(false);
    }

    if (vehicleId) {
      loadVehicle();
    }
  }, [vehicleId, router]);

  function openPage(url: string) {
    window.location.href = url;
  }

  // Добавляет ?from=service к ссылке на под-страницу автомобиля, если карточка
  // была открыта из "Автомобили клиентов" (MEDUZA SERVICE) — чтобы контекст не
  // терялся при переходах Редактировать/Документы/История/Пробег и обратно.
  function withBackContext(url: string) {
    return fromService ? `${url}${url.includes("?") ? "&" : "?"}from=service` : url;
  }

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
        <div
          style={{
            maxWidth: 1400,
            margin: "0 auto",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 10,
              marginBottom: 20,
            }}
          >
            <button
              type="button"
              onClick={() => openPage("/")}
              style={navButtonStyle}
            >
              Главное меню
            </button>

            <button
              type="button"
              onClick={() => router.push(fromService ? "/service/vehicles" : "/vehicles")}
              style={navButtonStyle}
            >
              ← Назад
            </button>
          </div>

          <div
            style={{
              background: "white",
              borderRadius: 12,
              padding: 24,
              border: "1px solid #e5e7eb",
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
      <div
        style={{
          maxWidth: 1400,
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
              {vehicle.plate_number}
            </h1>

            <div
              style={{
                marginTop: 6,
                color: "#666",
                fontSize: 16,
              }}
            >
              {[vehicle.make, vehicle.model].filter(Boolean).join(" ")}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
            }}
          >
            <button
              type="button"
              onClick={() => openPage("/")}
              style={navButtonStyle}
            >
              Главное меню
            </button>

            <button
              type="button"
              onClick={() => router.push(fromService ? "/service/vehicles" : "/vehicles")}
              style={navButtonStyle}
            >
              ← Назад
            </button>

            <button
              type="button"
              onClick={() => openPage(withBackContext(`/vehicles/${vehicleId}/edit`))}
              style={{
                ...navButtonStyle,
                border: "none",
                background: "#2563eb",
                color: "white",
                fontWeight: 600,
              }}
            >
              Редактировать
            </button>
          </div>
        </div>

        <section
          style={{
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: 14,
            padding: 24,
            boxShadow: "0 1px 4px rgba(0,0,0,.05)",
          }}
        >
          <h2
            style={{
              marginTop: 0,
              marginBottom: 22,
              fontSize: 22,
            }}
          >
            Основные данные
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 20,
            }}
          >
            <InfoItem
              label="Внутренний код"
              value={vehicle.internal_code || "—"}
            />

            <InfoItem
              label="Гос. номер"
              value={vehicle.plate_number || "—"}
            />

            <InfoItem
              label="VIN"
              value={vehicle.vin || "—"}
            />

            <InfoItem
              label="Марка"
              value={vehicle.make || "—"}
            />

            <InfoItem
              label="Модель"
              value={vehicle.model || "—"}
            />

            <InfoItem
              label="Год выпуска"
              value={
                vehicle.production_year
                  ? String(vehicle.production_year)
                  : "—"
              }
            />

            <InfoItem
              label="Цвет"
              value={vehicle.color || "—"}
            />

            <InfoItem
              label="Тип топлива"
              value={
                vehicle.fuel_type
                  ? fuelLabels[vehicle.fuel_type] || vehicle.fuel_type
                  : "—"
              }
            />

            <InfoItem
              label="Пробег"
              value={`${(
                vehicle.current_mileage || 0
              ).toLocaleString("ru-RU")} км`}
            />

            <InfoItem
              label="Статус"
              value={
                vehicle.status
                  ? statusLabels[vehicle.status] || vehicle.status
                  : "—"
              }
            />

            <InfoItem
              label="Страховка"
              value={docStatus(vehicle.insurance_expires_at).text}
              valueColor={docStatus(vehicle.insurance_expires_at).color}
            />

            <InfoItem
              label="ТО"
              value={docStatus(vehicle.inspection_expires_at).text}
              valueColor={docStatus(vehicle.inspection_expires_at).color}
            />

            <OwnerItem
              owner={owner}
              onClick={() => {
                if (owner) {
                  openPage(`/owners/${owner.id}`);
                }
              }}
            />
          </div>
        </section>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 16,
            marginTop: 20,
          }}
        >
          <ModuleCard
            title="Пробег"
            text="История пробега автомобиля"
            onClick={() =>
              openPage(withBackContext(`/vehicles/${vehicleId}/mileage`))
            }
          />

          <ModuleCard
            title="СТО"
            text="Ремонты, работы и рекомендации"
          />

          <ModuleCard
            title="Документы"
            text="Страховка, техосмотр, лицензии"
            onClick={() => openPage(withBackContext(`/vehicles/${vehicleId}/documents`))}
          />

          <ModuleCard
            title="События"
            text="История событий автомобиля"
            onClick={() => openPage(withBackContext(`/vehicles/${vehicleId}/history`))}
          />

          <ModuleCard
            title="Задачи"
            text="Напоминания и предстоящие работы"
          />
        </div>
      </div>
    </main>
  );
}

function InfoItem({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 13,
          color: "#777",
          marginBottom: 6,
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontSize: 16,
          fontWeight: 600,
          wordBreak: "break-word",
          color: valueColor,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function OwnerItem({
  owner,
  onClick,
}: {
  owner: Owner | null;
  onClick: () => void;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 13,
          color: "#777",
          marginBottom: 6,
        }}
      >
        Собственник
      </div>

      {owner ? (
        <button
          type="button"
          onClick={onClick}
          style={{
            border: "none",
            padding: 0,
            background: "transparent",
            fontSize: 16,
            fontWeight: 700,
            cursor: "pointer",
            textAlign: "left",
            textDecoration: "underline",
          }}
        >
          {owner.name}
        </button>
      ) : (
        <div
          style={{
            fontSize: 16,
            fontWeight: 600,
          }}
        >
          —
        </div>
      )}
    </div>
  );
}

function ModuleCard({
  title,
  text,
  onClick,
}: {
  title: string;
  text: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      style={{
        textAlign: "left",
        background: "white",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 20,
        minHeight: 100,
        boxShadow: "0 1px 3px rgba(0,0,0,.04)",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          marginBottom: 8,
        }}
      >
        {title}
      </div>

      <div
        style={{
          color: "#666",
          fontSize: 14,
        }}
      >
        {text}
      </div>
    </button>
  );
}