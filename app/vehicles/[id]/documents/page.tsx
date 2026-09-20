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
  plate_number: string;
  make: string | null;
  model: string | null;
  insurance_expires_at: string | null;
  inspection_expires_at: string | null;
};

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((target.getTime() - today.getTime()) / msPerDay);
}

function getStatus(dateStr: string | null): {
  label: string;
  color: string;
  bg: string;
} {
  if (!dateStr) {
    return { label: "Не указано", color: "#991b1b", bg: "#fee2e2" };
  }

  const days = daysUntil(dateStr);

  if (days < 0) {
    return { label: `Просрочено (${Math.abs(days)} дн. назад)`, color: "#991b1b", bg: "#fee2e2" };
  }

  if (days <= 30) {
    return { label: `Осталось ${days} дн.`, color: "#92400e", bg: "#fef3c7" };
  }

  return { label: `Осталось ${days} дн.`, color: "#166534", bg: "#dcfce7" };
}

function formatDate(dateStr: string) {
  const [year, month, day] = dateStr.split("-");
  return `${day}.${month}.${year}`;
}

export default function VehicleDocumentsPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const vehicleId = params.id as string;
  // См. app/vehicles/[id]/page.tsx — та же логика "машина клиента СТО".
  const fromService = searchParams.get("from") === "service";
  const backSuffix = fromService ? "?from=service" : "";

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [insuranceInput, setInsuranceInput] = useState("");
  const [inspectionInput, setInspectionInput] = useState("");
  // Значения на момент загрузки страницы — чтобы понять, менял ли
  // пользователь хоть одно из полей (кнопка "Сохранить" должна быть
  // активна только когда есть что сохранять).
  const [initialInsurance, setInitialInsurance] = useState("");
  const [initialInspection, setInitialInspection] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadVehicle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleId]);

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

    const { data, error } = await supabase
      .from("vehicles")
      .select(
        "id, plate_number, make, model, insurance_expires_at, inspection_expires_at"
      )
      .eq("id", vehicleId)
      .single();

    if (error || !data) {
      console.error(error);
      setErrorMessage("Не удалось загрузить автомобиль.");
      setLoading(false);
      return;
    }

    setVehicle(data);
    setInsuranceInput(data.insurance_expires_at || "");
    setInspectionInput(data.inspection_expires_at || "");
    setInitialInsurance(data.insurance_expires_at || "");
    setInitialInspection(data.inspection_expires_at || "");
    setLoading(false);
  }

  // Страховка и техосмотр — разные документы с разными сроками, которые
  // обновляются не одновременно. Поэтому сохранить можно и одну дату, и
  // обе сразу — вторая просто останется как была (или пустой, если ещё не
  // указана). Но кнопка активна только если реально что-то изменили —
  // иначе сохранять нечего.
  const hasChanges =
    insuranceInput !== initialInsurance ||
    inspectionInput !== initialInspection;
  const canSave = !saving && hasChanges;

  async function handleSave() {
    setSaving(true);
    setMessage("");
    setErrorMessage("");

    const { error } = await supabase
      .from("vehicles")
      .update({
        insurance_expires_at: insuranceInput || null,
        inspection_expires_at: inspectionInput || null,
      })
      .eq("id", vehicleId);

    if (error) {
      console.error(error);
      setErrorMessage("Не удалось сохранить: " + error.message);
      setSaving(false);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase.from("vehicle_events").insert({
      vehicle_id: vehicleId,
      event_type: "documents_updated",
      title: "Обновлены сроки документов",
      description: `Страховка до ${
        insuranceInput ? formatDate(insuranceInput) : "—"
      }; техосмотр до ${
        inspectionInput ? formatDate(inspectionInput) : "—"
      }`,
      actor_id: user?.id ?? null,
      payload: {
        insurance_expires_at: insuranceInput || null,
        inspection_expires_at: inspectionInput || null,
      },
    });

    router.replace(`/vehicles/${vehicleId}${backSuffix}`);
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
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
            <button type="button" onClick={() => router.push("/")} style={navButtonStyle}>
              Главное меню
            </button>
            <button type="button" onClick={() => router.push(`/vehicles/${vehicleId}${backSuffix}`)} style={navButtonStyle}>
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

  const insuranceStatus = getStatus(vehicle.insurance_expires_at);
  const inspectionStatus = getStatus(vehicle.inspection_expires_at);

  return (
    <main style={{ minHeight: "100vh", background: "#f5f6f8", padding: 32 }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
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
            <h1 style={{ margin: 0, fontSize: 32 }}>Документы</h1>
            <div style={{ marginTop: 6, color: "#666", fontSize: 16 }}>
              {vehicle.plate_number} ·{" "}
              {[vehicle.make, vehicle.model].filter(Boolean).join(" ")}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={() => router.push("/")} style={navButtonStyle}>
              Главное меню
            </button>
            <button type="button" onClick={() => router.push(`/vehicles/${vehicleId}${backSuffix}`)} style={navButtonStyle}>
              ← Назад
            </button>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 16,
            marginBottom: 20,
          }}
        >
          <div
            style={{
              background: insuranceStatus.bg,
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: 18,
            }}
          >
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 6 }}>
              Страховка
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: insuranceStatus.color }}>
              {vehicle.insurance_expires_at
                ? formatDate(vehicle.insurance_expires_at)
                : "Не указано"}
            </div>
            <div style={{ fontSize: 13, color: insuranceStatus.color, marginTop: 4 }}>
              {insuranceStatus.label}
            </div>
          </div>

          <div
            style={{
              background: inspectionStatus.bg,
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: 18,
            }}
          >
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 6 }}>
              Техосмотр
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: inspectionStatus.color }}>
              {vehicle.inspection_expires_at
                ? formatDate(vehicle.inspection_expires_at)
                : "Не указано"}
            </div>
            <div style={{ fontSize: 13, color: inspectionStatus.color, marginTop: 4 }}>
              {inspectionStatus.label}
            </div>
          </div>
        </div>

        <div
          style={{
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: 24,
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
              Страховка действует до
              <input
                type="date"
                value={insuranceInput}
                onChange={(e) => setInsuranceInput(e.target.value)}
                style={fieldStyle}
              />
            </label>

            <label style={labelStyle}>
              Техосмотр действует до
              <input
                type="date"
                value={inspectionInput}
                onChange={(e) => setInspectionInput(e.target.value)}
                style={fieldStyle}
              />
            </label>
          </div>

          {message && (
            <div style={{ marginTop: 16, color: "#15803d", fontWeight: 600 }}>
              {message}
            </div>
          )}

          {errorMessage && (
            <div style={{ marginTop: 16, color: "#dc2626", fontWeight: 600 }}>
              {errorMessage}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              style={{
                minWidth: 180,
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
              {saving ? "Сохранение..." : "Сохранить"}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 14, fontSize: 13, color: "#9ca3af" }}>
          Жёлтым — осталось 30 дней или меньше, красным — просрочено или не
          указано. Автоматические уведомления директору по этим срокам
          появятся позже (раздел «Уведомления»).
        </div>
      </div>
    </main>
  );
}
