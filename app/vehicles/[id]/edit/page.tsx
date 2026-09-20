"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);
function ownerSurname(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : name.trim();
}

function ownerSortKey(owner: { owner_type?: string | null; name: string }): string {
  const key =
    owner.owner_type === "company" ? owner.name : ownerSurname(owner.name);
  return key.trim().toLowerCase();
}

function ownerDisplayName(owner: { owner_type?: string | null; name: string }): string {
  if (owner.owner_type === "company") {
    return owner.name;
  }
  const parts = owner.name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return owner.name;
  }
  const surname = parts[parts.length - 1];
  const rest = parts.slice(0, parts.length - 1).join(" ");
  return `${surname} ${rest}`;
}


type Vehicle = {
  id: string;
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
};

type Owner = {
  id: string;
  name: string;
  owner_type?: string | null;
};

const statusLabels: Record<string, string> = {
  free: "Свободна",
  working: "В работе",
  service: "СТО",
  accident: "ДТП",
  blocked: "Заблокирована",
  inactive: "Неактивна",
};

// "В работе" не входит сюда: этот статус выставляется автоматически при
// открытии аренды (app/rent/new) и снимается только при её завершении
// (app/rent/[id]/end) — вручную его отсюда менять нельзя, чтобы не
// получить машину "в работе" без реальной аренды и водителя.
const manualStatusOptions = Object.entries(statusLabels).filter(
  ([value]) => value !== "working"
);

const fuelLabels: Record<string, string> = {
  hybrid: "Гибрид",
  petrol: "Бензин",
  petrol_lpg: "Бензин/Газ",
  diesel: "Дизель",
  electric: "Электро",
  lpg: "Газ / LPG",
};

const colors = [
  "Белый",
  "Черный",
  "Серый",
  "Серебристый",
  "Синий",
  "Темно-синий",
  "Серо-голубой",
  "Сине-голубой",
  "Цементно-серый",
  "Красный",
  "Зеленый",
  "Бежевый",
  "Коричневый",
  "Бронзовый металлик",
  "Другой",
];

function nullable(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export default function EditVehiclePage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const vehicleId = params.id as string;
  // См. app/vehicles/[id]/page.tsx — та же логика "машина клиента СТО".
  const fromService = searchParams.get("from") === "service";
  const backSuffix = fromService ? "?from=service" : "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [role, setRole] = useState("");

  const [original, setOriginal] = useState<Vehicle | null>(null);
  const [owners, setOwners] = useState<Owner[]>([]);

  const [ownerId, setOwnerId] = useState("");
  const [plateNumber, setPlateNumber] = useState("");
  const [vin, setVin] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [color, setColor] = useState("");
  const [fuelType, setFuelType] = useState("");
  const [mileage, setMileage] = useState("");
  const [status, setStatus] = useState("free");

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletingVehicle, setDeletingVehicle] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
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

      if (profile.role === "vehicle_owner") {
        router.replace("/owner");
        return;
      }

      setRole(profile.role);

      const { data: vehicleData, error: vehicleError } = await supabase
        .from("vehicles")
        .select(
          `
          id,
          plate_number,
          vin,
          make,
          model,
          production_year,
          fuel_type,
          color,
          current_mileage,
          status,
          owner_id
        `
        )
        .eq("id", vehicleId)
        .single();

      if (vehicleError || !vehicleData) {
        console.error(vehicleError);
        setErrorText("Не удалось загрузить автомобиль.");
        setLoading(false);
        return;
      }

      const { data: ownersData } = await supabase
        .from("vehicle_owners")
        .select("id, name, owner_type");

      const sortedOwners = (ownersData ?? [])
        .slice()
        .sort((a, b) =>
          ownerSortKey(a).localeCompare(ownerSortKey(b), "ru")
        );

      setOwners(sortedOwners);

      setOriginal(vehicleData);
      setOwnerId(vehicleData.owner_id || "");
      setPlateNumber(vehicleData.plate_number || "");
      setVin(vehicleData.vin || "");
      setMake(vehicleData.make || "");
      setModel(vehicleData.model || "");
      setYear(
        vehicleData.production_year
          ? String(vehicleData.production_year)
          : ""
      );
      setColor(vehicleData.color || "");
      setFuelType(vehicleData.fuel_type || "");
      setMileage(
        vehicleData.current_mileage !== null &&
          vehicleData.current_mileage !== undefined
          ? String(vehicleData.current_mileage)
          : ""
      );
      setStatus(vehicleData.status || "free");

      setLoading(false);
    }

    if (vehicleId) {
      loadPage();
    }
  }, [vehicleId, router]);

  function handleVinChange(value: string) {
    const cleaned = value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 17);
    setVin(cleaned);
  }

  const vinIsValid = /^[A-HJ-NPR-Z0-9]{17}$/.test(vin);

  const yearNumber = year.trim() !== "" ? Number(year) : null;
  const yearIsValid =
    year.trim() === "" ||
    (Number.isInteger(yearNumber) &&
      (yearNumber as number) >= 1980 &&
      (yearNumber as number) <= 2100);

  const mileageNumber = mileage.trim() !== "" ? Number(mileage) : 0;
  const mileageIsValid =
    mileage.trim() === "" ||
    (Number.isInteger(mileageNumber) && mileageNumber >= 0);

  const isValid = useMemo(
    () =>
      plateNumber.trim().length > 0 &&
      vinIsValid &&
      make.trim().length > 0 &&
      model.trim().length > 0 &&
      yearIsValid &&
      mileageIsValid,
    [plateNumber, vinIsValid, make, model, yearIsValid, mileageIsValid]
  );

  const canSave = isValid && !saving;

  async function handleSave() {
    if (!canSave || !original) return;

    setSaving(true);
    setErrorText("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("vehicles")
      .update({
        owner_id: ownerId || null,
        plate_number: plateNumber.trim().toUpperCase(),
        vin,
        make: make.trim(),
        model: model.trim(),
        production_year: yearNumber,
        color: nullable(color),
        fuel_type: nullable(fuelType),
        current_mileage: mileageNumber,
        status,
      })
      .eq("id", vehicleId);

    if (error) {
      console.error(error);
      setErrorText(
        error.message.includes("vehicles_vin_unique_active")
          ? "Автомобиль с таким VIN уже есть в системе."
          : "Не удалось сохранить изменения."
      );
      setSaving(false);
      return;
    }

    if (original.status !== status) {
      await supabase.from("vehicle_events").insert({
        vehicle_id: vehicleId,
        event_type: "vehicle_status_changed",
        title: "Статус автомобиля изменён",
        description: `${
          statusLabels[original.status || ""] || original.status || "—"
        } → ${statusLabels[status] || status}`,
        actor_id: user?.id ?? null,
        payload: { from: original.status, to: status },
      });
    }

    router.replace(`/vehicles/${vehicleId}${backSuffix}`);
  }

  async function handleDeleteVehicle() {
    if (!original) return;

    setDeletingVehicle(true);
    setDeleteError("");

    const { data: existingRentals, error: rentalsCheckError } = await supabase
      .from("rentals")
      .select("id")
      .eq("vehicle_id", vehicleId)
      .limit(1);

    if (rentalsCheckError) {
      console.error(rentalsCheckError);
      setDeleteError("Не удалось проверить историю аренд. Попробуйте ещё раз.");
      setDeletingVehicle(false);
      return;
    }

    const hasHistory = !!existingRentals && existingRentals.length > 0;

    if (hasHistory && role !== "director") {
      setDeleteError(
        "Нельзя удалить: по этому автомобилю есть история аренд."
      );
      setDeletingVehicle(false);
      return;
    }

    if (hasHistory && role === "director") {
      const { error: archiveError } = await supabase
        .from("vehicles")
        .update({ archived_at: new Date().toISOString(), status: "inactive" })
        .eq("id", vehicleId);

      if (archiveError) {
        console.error(archiveError);
        setDeleteError("Не удалось удалить автомобиль. Попробуйте ещё раз.");
        setDeletingVehicle(false);
        return;
      }

      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      await supabase.from("vehicle_events").insert({
        vehicle_id: vehicleId,
        event_type: "vehicle_archived",
        title: "Автомобиль удалён (архивирован)",
        description:
          "Удалено директором. По автомобилю есть история аренд, поэтому запись сохранена в архиве и в истории/отчётах, но сам автомобиль скрыт из всех списков.",
        actor_id: currentUser?.id ?? null,
        payload: { deleted_by_role: role },
      });

      router.replace(fromService ? "/service/vehicles" : "/vehicles");
      return;
    }

    const { error: deleteRowError } = await supabase
      .from("vehicles")
      .delete()
      .eq("id", vehicleId);

    if (deleteRowError) {
      console.error(deleteRowError);
      setDeleteError("Не удалось удалить автомобиль. Попробуйте ещё раз.");
      setDeletingVehicle(false);
      return;
    }

    router.replace(fromService ? "/service/vehicles" : "/vehicles");
  }

  const fieldStyle = {
    width: "100%",
    height: 46,
    padding: "0 12px",
    fontSize: 15,
    border: "1px solid #cfcfcf",
    borderRadius: 8,
    boxSizing: "border-box" as const,
    background: "white",
    marginTop: 6,
  };

  const labelStyle = {
    display: "block",
    fontSize: 14,
    fontWeight: 600,
  };

  const navButtonStyle = {
    height: 44,
    padding: "0 18px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    background: "white",
    cursor: "pointer",
    fontSize: 14,
  };

  const canDelete = role === "director" || role === "administrator";

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", background: "#f5f6f8", padding: 32 }}>
        Загрузка...
      </main>
    );
  }

  if (!original) {
    return (
      <main style={{ minHeight: "100vh", background: "#f5f6f8", padding: 32 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
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
              <h1 style={{ marginBottom: 4 }}>Редактирование автомобиля</h1>
              <div style={{ color: "#666" }}>MEDUZA SYSTEM</div>
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

          {errorText || "Автомобиль не найден."}
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f5f6f8", padding: 32 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div>
            <h1 style={{ marginBottom: 4 }}>Редактирование автомобиля</h1>
            <div style={{ color: "#666" }}>MEDUZA SYSTEM</div>
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
            marginTop: 24,
            background: "white",
            borderRadius: 14,
            padding: 26,
            boxShadow: "0 1px 5px rgba(0,0,0,.08)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "20px 24px",
            }}
          >
            <label style={labelStyle}>
              Собственник
              <select
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                style={fieldStyle}
              >
                <option value="">Не назначен</option>
                {owners.map((item) => (
                  <option key={item.id} value={item.id}>
                    {ownerDisplayName(item)}
                  </option>
                ))}
              </select>
            </label>

            <label style={labelStyle}>
              Гос. номер *
              <input
                value={plateNumber}
                onChange={(e) =>
                  setPlateNumber(e.target.value.toUpperCase())
                }
                style={fieldStyle}
              />
            </label>

            <label style={labelStyle}>
              VIN *
              <input
                value={vin}
                onChange={(e) => handleVinChange(e.target.value)}
                style={{
                  ...fieldStyle,
                  borderColor: vin.length > 0 && !vinIsValid ? "#dc2626" : "#cfcfcf",
                }}
              />
              {vin.length > 0 && !vinIsValid && (
                <div style={{ fontSize: 12, color: "#dc2626", marginTop: 4 }}>
                  VIN должен содержать 17 символов (без I, O, Q).
                </div>
              )}
            </label>

            <label style={labelStyle}>
              Марка *
              <input
                value={make}
                onChange={(e) => setMake(e.target.value)}
                style={fieldStyle}
              />
            </label>

            <label style={labelStyle}>
              Модель *
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                style={fieldStyle}
              />
            </label>

            <label style={labelStyle}>
              Год выпуска
              <input
                value={year}
                onChange={(e) => setYear(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="2022"
                style={fieldStyle}
              />
              {!yearIsValid && (
                <div style={{ fontSize: 12, color: "#dc2626", marginTop: 4 }}>
                  Введите год от 1980 до 2100.
                </div>
              )}
            </label>

            <label style={labelStyle}>
              Цвет
              <select
                value={color}
                onChange={(e) => setColor(e.target.value)}
                style={fieldStyle}
              >
                <option value="">Выберите цвет</option>
                {colors.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label style={labelStyle}>
              Тип топлива
              <select
                value={fuelType}
                onChange={(e) => setFuelType(e.target.value)}
                style={fieldStyle}
              >
                <option value="">Не указан</option>
                {Object.entries(fuelLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label style={labelStyle}>
              Пробег, км
              <input
                value={mileage}
                onChange={(e) =>
                  setMileage(e.target.value.replace(/[^0-9]/g, ""))
                }
                style={fieldStyle}
              />
            </label>

            <label style={labelStyle}>
              Статус
              {original?.status === "working" ? (
                <div
                  style={{
                    ...fieldStyle,
                    display: "flex",
                    alignItems: "center",
                    background: "#f3f4f6",
                    color: "#374151",
                  }}
                >
                  В работе (активная аренда)
                </div>
              ) : (
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  style={fieldStyle}
                >
                  {manualStatusOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              )}
              {original?.status === "working" && (
                <span
                  style={{
                    fontSize: 13,
                    color: "#6b7280",
                    fontWeight: 400,
                    marginTop: 4,
                  }}
                >
                  Статус снимается автоматически при завершении аренды на
                  странице аренды этого автомобиля.
                </span>
              )}
            </label>
          </div>

          {errorText && (
            <div style={{ marginTop: 20, color: "#dc2626", fontWeight: 600 }}>
              {errorText}
            </div>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: 28,
            }}
          >
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              style={{
                minWidth: 220,
                height: 46,
                padding: "0 20px",
                borderRadius: 8,
                border: "none",
                background: canSave ? "#2563eb" : "#c7c7c7",
                color: canSave ? "white" : "#555",
                fontSize: 15,
                fontWeight: 700,
                cursor: canSave ? "pointer" : "not-allowed",
              }}
            >
              {saving ? "Сохранение..." : "Сохранить изменения"}
            </button>
          </div>

          {canDelete && (
            <div
              style={{
                marginTop: 24,
                paddingTop: 20,
                borderTop: "1px solid #e5e7eb",
              }}
            >
              {confirmingDelete ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, color: "#666" }}>
                    Удалить автомобиль без возможности восстановления?
                  </span>

                  <button
                    type="button"
                    onClick={handleDeleteVehicle}
                    disabled={deletingVehicle}
                    style={{
                      height: 32,
                      padding: "0 12px",
                      borderRadius: 6,
                      border: "none",
                      background: "#dc2626",
                      color: "white",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: deletingVehicle ? "not-allowed" : "pointer",
                    }}
                  >
                    {deletingVehicle ? "..." : "Да, удалить"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setConfirmingDelete(false);
                      setDeleteError("");
                    }}
                    disabled={deletingVehicle}
                    style={{
                      height: 32,
                      padding: "0 12px",
                      borderRadius: 6,
                      border: "1px solid #d1d5db",
                      background: "white",
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    Отмена
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  style={{
                    height: 36,
                    padding: "0 14px",
                    borderRadius: 6,
                    border: "1px solid #fca5a5",
                    background: "white",
                    color: "#dc2626",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Удалить автомобиль
                </button>
              )}

              {deleteError && (
                <div style={{ marginTop: 8, fontSize: 13, color: "#dc2626", maxWidth: 420 }}>
                  {deleteError}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
