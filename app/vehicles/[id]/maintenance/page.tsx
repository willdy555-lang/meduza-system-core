"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

type Vehicle = {
  id: string;
  plate_number: string;
  make: string;
  model: string;
  current_mileage: number;
};

type MaintenanceItem = {
  id: string;
  maintenance_type: string;
  interval_km: number;
  last_done_mileage: number;
  last_done_date: string | null;
  notes: string | null;
};

const TYPE_SUGGESTIONS = [
  "Замена масла",
  "Замена масляного фильтра",
  "Замена воздушного фильтра",
  "Замена салонного фильтра",
  "Ремень ГРМ",
  "Тормозные колодки",
  "Свечи зажигания",
  "Шины",
];

export default function VehicleMaintenancePage() {
  const router = useRouter();
  const params = useParams();

  const vehicleId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [items, setItems] = useState<MaintenanceItem[]>([]);
  const [errorMessage, setErrorMessage] = useState("");

  const [showAddForm, setShowAddForm] = useState(false);
  const [newType, setNewType] = useState("");
  const [newInterval, setNewInterval] = useState("");
  const [newLastMileage, setNewLastMileage] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [addError, setAddError] = useState("");
  const [saving, setSaving] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (vehicleId) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleId]);

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

    setCanEdit(["director", "administrator", "rental_manager"].includes(profile.role));

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
    setNewLastMileage(String(vehicleData.current_mileage));

    const { data: itemsData, error: itemsError } = await supabase
      .from("vehicle_maintenance_items")
      .select(
        "id, maintenance_type, interval_km, last_done_mileage, last_done_date, notes"
      )
      .eq("vehicle_id", vehicleId)
      .order("maintenance_type");

    if (itemsError) {
      console.error(itemsError);
      setErrorMessage("Не удалось загрузить список ТО.");
    } else {
      setItems(itemsData || []);
    }

    setLoading(false);
  }

  function getRemaining(item: MaintenanceItem) {
    if (!vehicle) return 0;
    return item.last_done_mileage + item.interval_km - vehicle.current_mileage;
  }

  function getLevel(remaining: number): "ok" | "yellow" | "red" | "overdue" {
    if (remaining < 0) return "overdue";
    if (remaining <= 500) return "red";
    if (remaining <= 1000) return "yellow";
    return "ok";
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  async function handleAdd() {
    setAddError("");

    if (!newType.trim()) {
      setAddError("Укажите вид ТО.");
      return;
    }

    const interval = Number(newInterval);
    const lastMileage = Number(newLastMileage);

    if (!Number.isFinite(interval) || interval <= 0) {
      setAddError("Интервал должен быть положительным числом км.");
      return;
    }

    if (!Number.isFinite(lastMileage) || lastMileage < 0) {
      setAddError("Пробег при последнем ТО указан неверно.");
      return;
    }

    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("vehicle_maintenance_items").insert({
      vehicle_id: vehicleId,
      maintenance_type: newType.trim(),
      interval_km: interval,
      last_done_mileage: lastMileage,
      last_done_date: newDate || null,
      notes: newNotes.trim() || null,
      created_by: user?.id ?? null,
    });

    if (error) {
      console.error(error);
      setAddError("Не удалось сохранить: " + error.message);
      setSaving(false);
      return;
    }

    await supabase.from("vehicle_events").insert({
      vehicle_id: vehicleId,
      event_type: "maintenance_item_added",
      title: "Добавлен вид ТО",
      description: `${newType.trim()} — интервал ${interval.toLocaleString(
        "ru-RU"
      )} км`,
      actor_id: user?.id ?? null,
      payload: { maintenance_type: newType.trim(), interval_km: interval },
    });

    setShowAddForm(false);
    setNewType("");
    setNewInterval("");
    setNewLastMileage(String(vehicle?.current_mileage ?? ""));
    setNewDate("");
    setNewNotes("");
    setSaving(false);
    loadData();
  }

  async function handleMarkDoneNow(item: MaintenanceItem) {
    if (!vehicle) return;

    const today = new Date().toISOString().slice(0, 10);

    const { error } = await supabase
      .from("vehicle_maintenance_items")
      .update({
        last_done_mileage: vehicle.current_mileage,
        last_done_date: today,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id);

    if (error) {
      console.error(error);
      setErrorMessage("Не удалось обновить ТО: " + error.message);
      return;
    }

    const {
      data: { user: doneByUser },
    } = await supabase.auth.getUser();

    await supabase.from("vehicle_events").insert({
      vehicle_id: vehicleId,
      event_type: "maintenance_done",
      title: "Выполнено ТО",
      description: `${item.maintenance_type} — на пробеге ${vehicle.current_mileage.toLocaleString(
        "ru-RU"
      )} км`,
      actor_id: doneByUser?.id ?? null,
      payload: { maintenance_item_id: item.id },
    });

    loadData();
  }

  async function handleDelete(itemId: string) {
    const itemToDelete = items.find((i) => i.id === itemId);

    const { error } = await supabase
      .from("vehicle_maintenance_items")
      .delete()
      .eq("id", itemId);

    if (error) {
      console.error(error);
      setErrorMessage("Не удалось удалить: " + error.message);
      setConfirmDeleteId(null);
      return;
    }

    const {
      data: { user: deletedByUser },
    } = await supabase.auth.getUser();

    await supabase.from("vehicle_events").insert({
      vehicle_id: vehicleId,
      event_type: "maintenance_item_deleted",
      title: "Удалён вид ТО",
      description: itemToDelete ? itemToDelete.maintenance_type : "—",
      actor_id: deletedByUser?.id ?? null,
      payload: { maintenance_item_id: itemId },
    });

    setConfirmDeleteId(null);
    loadData();
  }

  if (loading) {
    return <main style={loadingStyle}>Загрузка...</main>;
  }

  if (errorMessage && !vehicle) {
    return (
      <main style={pageStyle}>
        <div style={containerStyle}>
          <div style={headerButtonsStyle}>
            <button
              type="button"
              onClick={() => router.push("/")}
              style={secondaryButtonStyle}
            >
              Главное меню
            </button>

            <button
              type="button"
              onClick={() => router.push("/mileage")}
              style={secondaryButtonStyle}
            >
              ← Назад
            </button>
          </div>

          <div style={{ ...tableCardStyle, padding: 24, marginTop: 20 }}>
            {errorMessage}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <div style={headerStyle}>
          <div>
            <div style={systemTitleStyle}>MEDUZA SYSTEM</div>
            <h1 style={titleStyle}>Техобслуживание по пробегу</h1>
            <div style={subtitleStyle}>
              {vehicle?.plate_number} · {vehicle?.make} {vehicle?.model} ·
              текущий пробег {vehicle?.current_mileage.toLocaleString("ru-RU")}{" "}
              км
            </div>
          </div>

          <div style={headerButtonsStyle}>
            <button
              type="button"
              onClick={() => router.push("/")}
              style={secondaryButtonStyle}
            >
              Главное меню
            </button>

            <button
              type="button"
              onClick={() => router.push("/mileage")}
              style={secondaryButtonStyle}
            >
              ← Назад
            </button>
          </div>
        </div>

        {errorMessage && <div style={errorBoxStyle}>{errorMessage}</div>}

        <div style={tableCardStyle}>
          <div style={tableScrollStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Вид ТО</th>
                  <th style={thStyle}>Последнее ТО</th>
                  <th style={thStyle}>Интервал</th>
                  <th style={thStyle}>Следующее ТО (км)</th>
                  <th style={thStyle}>Осталось</th>
                  {canEdit && <th style={thStyle}></th>}
                </tr>
              </thead>

              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 6 : 5} style={emptyTableStyle}>
                      Виды ТО пока не добавлены
                    </td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const remaining = getRemaining(item);
                    const level = getLevel(remaining);
                    const nextDue = item.last_done_mileage + item.interval_km;

                    return (
                      <tr key={item.id} style={getRowStyle(level)}>
                        <td style={tdStyle}>{item.maintenance_type}</td>

                        <td style={tdStyle}>
                          {item.last_done_mileage.toLocaleString("ru-RU")} км
                          {item.last_done_date
                            ? ` (${formatDate(item.last_done_date)})`
                            : ""}
                        </td>

                        <td style={tdStyle}>
                          {item.interval_km.toLocaleString("ru-RU")} км
                        </td>

                        <td style={tdStyle}>
                          {nextDue.toLocaleString("ru-RU")} км
                        </td>

                        <td style={tdStyle}>
                          <span style={statusLabelStyle(level)}>
                            {level === "overdue"
                              ? `просрочено на ${Math.abs(
                                  remaining
                                ).toLocaleString("ru-RU")} км`
                              : `через ${remaining.toLocaleString(
                                  "ru-RU"
                                )} км`}
                          </span>
                        </td>

                        {canEdit && (
                          <td style={tdActionStyle}>
                            <div style={actionGroupStyle}>
                              <button
                                type="button"
                                onClick={() => handleMarkDoneNow(item)}
                                style={smallButtonStyle}
                              >
                                Выполнено сейчас
                              </button>

                              {confirmDeleteId === item.id ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(item.id)}
                                    style={deleteConfirmButtonStyle}
                                  >
                                    Да, удалить
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(null)}
                                    style={smallButtonStyle}
                                  >
                                    Отмена
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(item.id)}
                                  style={deleteLinkStyle}
                                >
                                  Удалить
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {canEdit && (
          <div style={addSectionStyle}>
            {!showAddForm ? (
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                style={primaryButtonStyle}
              >
                + Добавить вид ТО
              </button>
            ) : (
              <div style={addFormCardStyle}>
                <div style={addFormGridStyle}>
                  <div>
                    <label style={labelStyle}>Вид ТО *</label>
                    <input
                      type="text"
                      list="maintenance-type-suggestions"
                      value={newType}
                      onChange={(e) => setNewType(e.target.value)}
                      placeholder="например, Замена масла"
                      style={inputStyle}
                    />
                    <datalist id="maintenance-type-suggestions">
                      {TYPE_SUGGESTIONS.map((suggestion) => (
                        <option key={suggestion} value={suggestion} />
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <label style={labelStyle}>Интервал (км) *</label>
                    <input
                      type="number"
                      value={newInterval}
                      onChange={(e) => setNewInterval(e.target.value)}
                      placeholder="например, 10000"
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Пробег при последнем ТО *</label>
                    <input
                      type="number"
                      value={newLastMileage}
                      onChange={(e) => setNewLastMileage(e.target.value)}
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Дата ТО (необязательно)</label>
                    <input
                      type="date"
                      value={newDate}
                      onChange={(e) => setNewDate(e.target.value)}
                      style={inputStyle}
                    />
                  </div>

                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={labelStyle}>Заметка (необязательно)</label>
                    <input
                      type="text"
                      value={newNotes}
                      onChange={(e) => setNewNotes(e.target.value)}
                      style={inputStyle}
                    />
                  </div>
                </div>

                {addError && <div style={rowErrorStyle}>{addError}</div>}

                <div style={addFormButtonsStyle}>
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    style={secondaryButtonStyle}
                  >
                    Отмена
                  </button>

                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleAdd}
                    style={primaryButtonStyle}
                  >
                    {saving ? "Сохраняем..." : "Сохранить"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function getRowStyle(level: "ok" | "yellow" | "red" | "overdue") {
  if (level === "yellow") return { ...trBaseStyle, background: "#fef9c3" };
  if (level === "red") return { ...trBaseStyle, background: "#fecaca" };
  if (level === "overdue") return { ...trBaseStyle, background: "#fca5a5" };
  return trBaseStyle;
}

function statusLabelStyle(level: "ok" | "yellow" | "red" | "overdue") {
  if (level === "ok") return { color: "#16a34a", fontSize: "13px", fontWeight: 600 };
  if (level === "overdue")
    return { color: "#991b1b", fontSize: "13px", fontWeight: 700 };
  return { color: "#7f1d1d", fontSize: "13px", fontWeight: 600 };
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f4f5f7",
  padding: "32px",
  fontFamily: "Arial, sans-serif",
  color: "#111827",
};

const loadingStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f4f5f7",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "Arial, sans-serif",
  color: "#111827",
};

const containerStyle: React.CSSProperties = {
  maxWidth: "1400px",
  margin: "0 auto",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "20px",
};

const systemTitleStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#6b7280",
  marginBottom: "6px",
  letterSpacing: "0.04em",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "30px",
  fontWeight: 700,
};

const subtitleStyle: React.CSSProperties = {
  marginTop: "6px",
  fontSize: "14px",
  color: "#6b7280",
};

const headerButtonsStyle: React.CSSProperties = {
  display: "flex",
  gap: "10px",
};

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

const primaryButtonStyle: React.CSSProperties = {
  height: "42px",
  padding: "0 17px",
  border: "none",
  borderRadius: "8px",
  background: "#2563eb",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
};

const errorBoxStyle: React.CSSProperties = {
  padding: 16,
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#991b1b",
  borderRadius: 8,
  marginBottom: 16,
  fontSize: 14,
};

const tableCardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  overflow: "hidden",
};

const tableScrollStyle: React.CSSProperties = {
  overflowX: "auto",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: "900px",
};

const thStyle: React.CSSProperties = {
  padding: "13px 16px",
  textAlign: "left",
  background: "#f9fafb",
  borderBottom: "1px solid #e5e7eb",
  fontSize: "12px",
  fontWeight: 600,
  color: "#6b7280",
  whiteSpace: "nowrap",
};

const trBaseStyle: React.CSSProperties = {
  background: "#ffffff",
};

const tdStyle: React.CSSProperties = {
  padding: "13px 16px",
  textAlign: "left",
  borderBottom: "1px solid #f0f1f3",
  fontSize: "14px",
  whiteSpace: "nowrap",
};

const tdActionStyle: React.CSSProperties = {
  padding: "10px 16px",
  textAlign: "right",
  borderBottom: "1px solid #f0f1f3",
  whiteSpace: "nowrap",
};

const actionGroupStyle: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  justifyContent: "flex-end",
  alignItems: "center",
};

const smallButtonStyle: React.CSSProperties = {
  height: "32px",
  padding: "0 12px",
  border: "1px solid #d1d5db",
  borderRadius: "6px",
  background: "#ffffff",
  color: "#111827",
  fontSize: "12px",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const deleteLinkStyle: React.CSSProperties = {
  border: "none",
  background: "none",
  color: "#dc2626",
  fontSize: "12px",
  textDecoration: "underline",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const deleteConfirmButtonStyle: React.CSSProperties = {
  height: "32px",
  padding: "0 12px",
  border: "none",
  borderRadius: "6px",
  background: "#dc2626",
  color: "#ffffff",
  fontSize: "12px",
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const emptyTableStyle: React.CSSProperties = {
  padding: "36px 16px",
  textAlign: "center",
  fontSize: "14px",
  color: "#9ca3af",
};

const addSectionStyle: React.CSSProperties = {
  marginTop: "20px",
};

const addFormCardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  padding: "20px",
};

const addFormGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "16px",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "13px",
  color: "#6b7280",
  marginBottom: "6px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: "40px",
  padding: "0 12px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  fontSize: "14px",
  boxSizing: "border-box",
};

const rowErrorStyle: React.CSSProperties = {
  marginTop: "12px",
  fontSize: "13px",
  color: "#dc2626",
};

const addFormButtonsStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "10px",
  marginTop: "18px",
};
