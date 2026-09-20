"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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


type Owner = {
  id: string;
  name: string;
  owner_type?: string | null;
};

const vehicleModels: Record<string, string[]> = {
  Toyota: [
    "Corolla",
    "Camry",
    "RAV4",
    "Auris",
    "Prius 20",
    "Prius 30",
    "Prius 50",
    "Prius Plus",
    "Prius V",
  ],

  Lexus: ["CT 200h", "IS", "ES"],

  Tesla: ["Model S", "Model 3"],
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

export default function NewVehiclePage() {
  const router = useRouter();

  const [owners, setOwners] = useState<Owner[]>([]);
  const [ownerId, setOwnerId] = useState("");

  const [plateNumber, setPlateNumber] = useState("");
  const [vin, setVin] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [color, setColor] = useState("");
  const [year, setYear] = useState("");
  const [fuelType, setFuelType] = useState("hybrid");
  const [mileage, setMileage] = useState("");
  const [status, setStatus] = useState("free");
  const [insuranceExpiresAt, setInsuranceExpiresAt] = useState("");
  const [inspectionExpiresAt, setInspectionExpiresAt] = useState("");

  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);

  useEffect(() => {
    async function checkAccess() {
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

      setCheckingAccess(false);
    }

    checkAccess();
  }, [router]);

  useEffect(() => {
    async function loadOwners() {
      const { data, error } = await supabase
        .from("vehicle_owners")
        .select("id, name, owner_type");

      if (error) {
        console.error(error);
        return;
      }

      const sorted = (data ?? [])
        .slice()
        .sort((a, b) =>
          ownerSortKey(a).localeCompare(ownerSortKey(b), "ru")
        );

      setOwners(sorted);
    }

    loadOwners();
  }, []);

  function handleMakeChange(value: string) {
    setMake(value);
    setModel("");
  }

  function handleVinChange(value: string) {
    const cleaned = value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 17);

    setVin(cleaned);
  }

  const vinIsValid = /^[A-HJ-NPR-Z0-9]{17}$/.test(vin);

  const yearNumber = Number(year);

  const yearIsValid =
    year.trim() !== "" &&
    Number.isInteger(yearNumber) &&
    yearNumber >= 1980 &&
    yearNumber <= 2100;

  const mileageNumber = mileage.trim() !== "" ? Number(mileage) : 0;

  const mileageIsValid =
    mileage.trim() === "" ||
    (Number.isInteger(mileageNumber) && mileageNumber >= 0);

  const canSave =
    ownerId !== "" &&
    make !== "" &&
    model !== "" &&
    plateNumber.trim() !== "" &&
    vinIsValid &&
    yearIsValid &&
    mileageIsValid &&
    insuranceExpiresAt.trim() !== "" &&
    inspectionExpiresAt.trim() !== "" &&
    !saving;

  async function saveVehicle() {
    setMessage("");

    if (!ownerId) {
      setMessage("Выберите собственника.");
      return;
    }

    if (!make) {
      setMessage("Выберите марку автомобиля.");
      return;
    }

    if (!model) {
      setMessage("Выберите модель автомобиля.");
      return;
    }

    if (!plateNumber.trim()) {
      setMessage("Введите государственный номер.");
      return;
    }

    if (vin.length !== 17) {
      setMessage("VIN должен содержать ровно 17 символов.");
      return;
    }

    if (!vinIsValid) {
      setMessage(
        "VIN содержит недопустимые символы. Используйте 17 букв и цифр без I, O и Q."
      );
      return;
    }

    if (!yearIsValid) {
      setMessage("Введите корректный год выпуска.");
      return;
    }

    if (!mileageIsValid) {
      setMessage("Введите корректный пробег.");
      return;
    }

    if (!insuranceExpiresAt.trim()) {
      setMessage("Укажите дату окончания страховки.");
      return;
    }

    if (!inspectionExpiresAt.trim()) {
      setMessage("Укажите дату окончания техосмотра.");
      return;
    }

    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("Пользователь не авторизован.");
      setSaving(false);
      return;
    }

    // 1. Создаём автомобиль
    const { data: vehicleData, error: vehicleError } = await supabase
      .from("vehicles")
      .insert({
        owner_id: ownerId,
        plate_number: plateNumber.trim().toUpperCase(),
        vin: vin,
        make,
        model,
        color: color || null,
        production_year: yearNumber,
        fuel_type: fuelType,
        current_mileage: mileageNumber,
        status,
        cooperation_type: "managed",
        insurance_expires_at: insuranceExpiresAt,
        inspection_expires_at: inspectionExpiresAt,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (vehicleError || !vehicleData) {
      setMessage(
        "Ошибка создания автомобиля: " +
          (vehicleError?.message || "неизвестная ошибка")
      );
      setSaving(false);
      return;
    }

    // 2. Если пробег был введён вручную,
    // создаём первую запись истории пробега
    if (mileage.trim() !== "") {
      const { error: mileageError } = await supabase
        .from("mileage_entries")
        .insert({
          vehicle_id: vehicleData.id,
          mileage: mileageNumber,
          entered_by: user.id,
          source: "vehicle_creation",
          entry_type: "initial",
          note: "Первичный пробег при добавлении автомобиля",
        });

      if (mileageError) {
        // Чтобы не получить автомобиль без его первичной истории,
        // удаляем только что созданную запись автомобиля.
        await supabase
          .from("vehicles")
          .delete()
          .eq("id", vehicleData.id);

        setMessage(
          "Ошибка сохранения первичного пробега: " +
            mileageError.message
        );

        setSaving(false);
        return;
      }
    }

    router.push("/vehicles");
    router.refresh();
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

  if (checkingAccess) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        Загрузка...
      </main>
    );
  }

  return (
    <main
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: 32,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div>
          <h1 style={{ marginBottom: 4 }}>
            Добавить автомобиль
          </h1>

          <div style={{ color: "#666" }}>
            MEDUZA SYSTEM
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
            onClick={() => router.push("/")}
            style={navButtonStyle}
          >
            Главное меню
          </button>

          <button
            type="button"
            onClick={() => router.push("/vehicles")}
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
            gridTemplateColumns:
              "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "20px 24px",
          }}
        >
          <label style={labelStyle}>
            Собственник *
            <select
              value={ownerId}
              onChange={(e) =>
                setOwnerId(e.target.value)
              }
              style={fieldStyle}
            >
              <option value="">
                Выберите собственника
              </option>

              {owners.map((owner) => (
                <option
                  key={owner.id}
                  value={owner.id}
                >
                  {ownerDisplayName(owner)}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            Марка *
            <select
              value={make}
              onChange={(e) =>
                handleMakeChange(e.target.value)
              }
              style={fieldStyle}
            >
              <option value="">
                Выберите марку
              </option>

              <option value="Toyota">
                Toyota
              </option>

              <option value="Lexus">
                Lexus
              </option>

              <option value="Tesla">
                Tesla
              </option>
            </select>
          </label>

          <label style={labelStyle}>
            Модель *
            <select
              value={model}
              onChange={(e) =>
                setModel(e.target.value)
              }
              style={fieldStyle}
              disabled={!make}
            >
              <option value="">
                {make
                  ? "Выберите модель"
                  : "Сначала выберите марку"}
              </option>

              {make &&
                vehicleModels[make]?.map(
                  (item) => (
                    <option
                      key={item}
                      value={item}
                    >
                      {item}
                    </option>
                  )
                )}
            </select>
          </label>

          <label style={labelStyle}>
            Гос. номер *
            <input
              value={plateNumber}
              onChange={(e) =>
                setPlateNumber(
                  e.target.value.toUpperCase()
                )
              }
              placeholder="WY111EK"
              style={fieldStyle}
            />
          </label>

          <label style={labelStyle}>
            VIN *
            <input
              value={vin}
              onChange={(e) =>
                handleVinChange(e.target.value)
              }
              placeholder="JTDZN3EU1D3227126"
              maxLength={17}
              style={{
                ...fieldStyle,
                border:
                  vin.length > 0 && !vinIsValid
                    ? "1px solid #dc2626"
                    : "1px solid #cfcfcf",
              }}
            />

            <div
              style={{
                marginTop: 5,
                fontSize: 12,
                color:
                  vin.length === 17 &&
                  vinIsValid
                    ? "#15803d"
                    : "#666",
              }}
            >
              {vin.length}/17 символов
            </div>
          </label>

          <label style={labelStyle}>
            Год выпуска *
            <input
              type="number"
              min="1980"
              max="2100"
              value={year}
              onChange={(e) =>
                setYear(e.target.value)
              }
              placeholder="2022"
              style={fieldStyle}
            />
          </label>

          <label style={labelStyle}>
            Цвет
            <select
              value={color}
              onChange={(e) =>
                setColor(e.target.value)
              }
              style={fieldStyle}
            >
              <option value="">
                Выберите цвет
              </option>

              {colors.map((item) => (
                <option
                  key={item}
                  value={item}
                >
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            Тип топлива
            <select
              value={fuelType}
              onChange={(e) =>
                setFuelType(e.target.value)
              }
              style={fieldStyle}
            >
              <option value="hybrid">
                Гибрид
              </option>

              <option value="petrol">
                Бензин
              </option>

              <option value="petrol_lpg">
                Бензин/Газ
              </option>

              <option value="diesel">
                Дизель
              </option>

              <option value="electric">
                Электро
              </option>

              <option value="lpg">
                Газ / LPG
              </option>
            </select>
          </label>

          <label style={labelStyle}>
            Первичный пробег
            <input
              type="number"
              min="0"
              step="1"
              value={mileage}
              onChange={(e) =>
                setMileage(e.target.value)
              }
              placeholder="Пробег при поступлении"
              style={fieldStyle}
            />

            <div
              style={{
                marginTop: 5,
                fontSize: 12,
                color: "#666",
                fontWeight: 400,
              }}
            >
              Если указать — сохранится в истории
              пробегов
            </div>
          </label>

          <label style={labelStyle}>
            Статус
            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value)
              }
              style={fieldStyle}
            >
              <option value="free">
                Свободна
              </option>

              <option value="working">
                В работе
              </option>

              <option value="service">
                СТО
              </option>

              <option value="accident">
                ДТП
              </option>

              <option value="blocked">
                Заблокирована
              </option>
            </select>
          </label>

          <label style={labelStyle}>
            Страховка действует до *
            <input
              type="date"
              value={insuranceExpiresAt}
              onChange={(e) =>
                setInsuranceExpiresAt(e.target.value)
              }
              style={fieldStyle}
            />
          </label>

          <label style={labelStyle}>
            Техосмотр действует до *
            <input
              type="date"
              value={inspectionExpiresAt}
              onChange={(e) =>
                setInspectionExpiresAt(e.target.value)
              }
              style={fieldStyle}
            />
          </label>
        </div>

        {message && (
          <div
            style={{
              marginTop: 20,
              fontWeight: 600,
            }}
          >
            {message}
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
            onClick={saveVehicle}
            disabled={!canSave}
            style={{
              minWidth: 220,
              height: 46,
              padding: "0 20px",
              borderRadius: 8,
              border: "none",

              background: canSave
                ? "#2563eb"
                : "#c7c7c7",

              color: canSave
                ? "white"
                : "#555",

              fontSize: 15,
              fontWeight: 700,

              cursor: canSave
                ? "pointer"
                : "not-allowed",
            }}
          >
            {saving
              ? "Сохранение..."
              : "Сохранить автомобиль"}
          </button>
        </div>
      </div>
    </main>
  );
}