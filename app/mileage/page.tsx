"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  created_at: string;
};

type MileageEntryRow = {
  vehicle_id: string;
  mileage: number;
  recorded_at: string;
};

type MaintenanceItemRow = {
  vehicle_id: string;
  interval_km: number;
  last_done_mileage: number;
};

const EDITOR_ROLES = ["director", "administrator", "rental_manager"];

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function parseDateInputValue(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatWeekLabel(weekStart: Date): string {
  const weekEnd = addDays(weekStart, 6);
  const fullFormat = (date: Date) =>
    date.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  return `${fullFormat(weekStart)} – ${fullFormat(weekEnd)}`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function MileagePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [entriesByVehicle, setEntriesByVehicle] = useState<
    Record<string, MileageEntryRow[]>
  >({});
  const [maintenanceByVehicle, setMaintenanceByVehicle] = useState<
    Record<string, MaintenanceItemRow[]>
  >({});
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [selectedWeekStart, setSelectedWeekStart] = useState<Date>(() =>
    getMonday(new Date())
  );

  useEffect(() => {
    loadPage();
  }, []);

  async function loadPage() {
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

    setCanEdit(EDITOR_ROLES.includes(profile.role));

    const { data: vehicleData, error: vehicleError } = await supabase
      .from("vehicles")
      .select("id, plate_number, make, model, current_mileage, created_at")
      .is("archived_at", null)
      .order("plate_number");

    if (vehicleError) {
      console.error(vehicleError);
      setVehicles([]);
      setLoading(false);
      return;
    }

    setVehicles(vehicleData || []);

    const vehicleIds = (vehicleData || []).map((vehicle) => vehicle.id);

    if (vehicleIds.length > 0) {
      const [entryResult, maintenanceResult] = await Promise.all([
        supabase
          .from("mileage_entries")
          .select("vehicle_id, mileage, recorded_at")
          .in("vehicle_id", vehicleIds)
          .order("recorded_at", { ascending: false }),
        supabase
          .from("vehicle_maintenance_items")
          .select("vehicle_id, interval_km, last_done_mileage")
          .in("vehicle_id", vehicleIds),
      ]);

      if (entryResult.error) {
        console.error(entryResult.error);
      } else {
        const grouped: Record<string, MileageEntryRow[]> = {};

        (entryResult.data || []).forEach((entry) => {
          if (!grouped[entry.vehicle_id]) {
            grouped[entry.vehicle_id] = [];
          }
          grouped[entry.vehicle_id].push(entry);
        });

        setEntriesByVehicle(grouped);
      }

      if (maintenanceResult.error) {
        console.error(maintenanceResult.error);
      } else {
        const groupedMaintenance: Record<string, MaintenanceItemRow[]> = {};

        (maintenanceResult.data || []).forEach((item) => {
          if (!groupedMaintenance[item.vehicle_id]) {
            groupedMaintenance[item.vehicle_id] = [];
          }
          groupedMaintenance[item.vehicle_id].push(item);
        });

        setMaintenanceByVehicle(groupedMaintenance);
      }
    }

    setLoading(false);
  }

  function daysSince(dateStr: string) {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  // Entries for the currently SELECTED week (navigable), independent of
  // today's date. entriesByVehicle is sorted newest-first.
  function getWeekData(vehicle: Vehicle) {
    const entries = entriesByVehicle[vehicle.id] || [];
    const weekStart = selectedWeekStart;
    const weekEnd = addDays(weekStart, 7);

    const entryThisWeek =
      entries.find((entry) => {
        const t = new Date(entry.recorded_at).getTime();
        return t >= weekStart.getTime() && t < weekEnd.getTime();
      }) || null;

    const previousEntry =
      entries.find(
        (entry) => new Date(entry.recorded_at).getTime() < weekStart.getTime()
      ) || null;

    return { entryThisWeek, previousEntry };
  }

  // Staleness is always relative to TODAY (how overdue the vehicle is right
  // now), regardless of which week is being viewed.
  function getStaleness(vehicle: Vehicle): {
    days: number;
    level: "ok" | "yellow" | "red" | "critical";
  } {
    const entries = entriesByVehicle[vehicle.id] || [];
    const referenceDate = entries[0]?.recorded_at ?? vehicle.created_at;
    const days = daysSince(referenceDate);

    if (days <= 7) return { days, level: "ok" };
    if (days <= 14) return { days, level: "yellow" };
    if (days <= 29) return { days, level: "red" };
    return { days, level: "critical" };
  }

  function getNearestMaintenance(vehicle: Vehicle) {
    const items = maintenanceByVehicle[vehicle.id] || [];

    if (items.length === 0) return null;

    let nearest: { remaining: number } | null = null;

    items.forEach((item) => {
      const remaining =
        item.last_done_mileage + item.interval_km - vehicle.current_mileage;

      if (nearest === null || remaining < nearest.remaining) {
        nearest = { remaining };
      }
    });

    return nearest;
  }

  function getMaintenanceLevel(
    remaining: number
  ): "ok" | "yellow" | "red" | "overdue" {
    if (remaining < 0) return "overdue";
    if (remaining <= 500) return "red";
    if (remaining <= 1000) return "yellow";
    return "ok";
  }

  async function handleSave(vehicle: Vehicle) {
    const rawValue = (inputValues[vehicle.id] || "").trim();

    if (!rawValue) {
      setRowErrors((prev) => ({ ...prev, [vehicle.id]: "Введите пробег." }));
      return;
    }

    const newMileage = Number(rawValue);

    if (!Number.isFinite(newMileage) || !Number.isInteger(newMileage)) {
      setRowErrors((prev) => ({
        ...prev,
        [vehicle.id]: "Пробег должен быть целым числом.",
      }));
      return;
    }

    if (newMileage < vehicle.current_mileage) {
      setRowErrors((prev) => ({
        ...prev,
        [vehicle.id]: `Пробег не может быть меньше текущего (${vehicle.current_mileage.toLocaleString(
          "ru-RU"
        )} км).`,
      }));
      return;
    }

    setRowErrors((prev) => ({ ...prev, [vehicle.id]: "" }));
    setSavingId(vehicle.id);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const nowIso = new Date().toISOString();

    const { error: insertError } = await supabase
      .from("mileage_entries")
      .insert({
        vehicle_id: vehicle.id,
        mileage: newMileage,
        recorded_at: nowIso,
        entered_by: user?.id ?? null,
        entry_type: "weekly",
        source: "manual",
      });

    if (insertError) {
      console.error(insertError);
      setRowErrors((prev) => ({
        ...prev,
        [vehicle.id]: "Не удалось сохранить: " + insertError.message,
      }));
      setSavingId(null);
      return;
    }

    const { error: updateError } = await supabase
      .from("vehicles")
      .update({ current_mileage: newMileage })
      .eq("id", vehicle.id);

    if (updateError) {
      console.error(updateError);
      setRowErrors((prev) => ({
        ...prev,
        [vehicle.id]: "Не удалось обновить авто: " + updateError.message,
      }));
      setSavingId(null);
      return;
    }

    await supabase.from("vehicle_events").insert({
      vehicle_id: vehicle.id,
      event_type: "mileage_entry",
      title: "Внесён пробег",
      description: `${newMileage.toLocaleString("ru-RU")} км (было ${vehicle.current_mileage.toLocaleString(
        "ru-RU"
      )} км)`,
      actor_id: user?.id ?? null,
      payload: { mileage: newMileage },
    });

    setVehicles((prev) =>
      prev.map((item) =>
        item.id === vehicle.id
          ? { ...item, current_mileage: newMileage }
          : item
      )
    );

    setEntriesByVehicle((prev) => {
      const existing = prev[vehicle.id] || [];
      const newEntry: MileageEntryRow = {
        vehicle_id: vehicle.id,
        mileage: newMileage,
        recorded_at: nowIso,
      };
      return {
        ...prev,
        [vehicle.id]: [newEntry, ...existing],
      };
    });

    setInputValues((prev) => ({ ...prev, [vehicle.id]: "" }));
    setSavingId(null);
  }

  if (loading) {
    return <main style={loadingStyle}>Загрузка...</main>;
  }

  const currentWeekStart = getMonday(new Date());
  const isViewingCurrentWeek =
    selectedWeekStart.getTime() === currentWeekStart.getTime();

  const earliestVehicleDate =
    vehicles.length > 0
      ? new Date(
          Math.min(...vehicles.map((v) => new Date(v.created_at).getTime()))
        )
      : currentWeekStart;
  const minWeekStart = getMonday(earliestVehicleDate);
  const isAtEarliestWeek = selectedWeekStart.getTime() <= minWeekStart.getTime();

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <div style={headerStyle}>
          <div>
            <div style={systemTitleStyle}>MEDUZA SYSTEM</div>
            <h1 style={titleStyle}>Пробеги</h1>
            <div style={subtitleStyle}>
              Еженедельная фиксация пробега по автопарку
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
              onClick={() => router.push("/partner")}
              style={secondaryButtonStyle}
            >
              ← Назад
            </button>
          </div>
        </div>

        <div style={weekBarStyle}>
          <button
            type="button"
            onClick={() => setSelectedWeekStart(addDays(selectedWeekStart, -7))}
            disabled={isAtEarliestWeek}
            style={{
              ...weekNavButtonStyle,
              opacity: isAtEarliestWeek ? 0.4 : 1,
              cursor: isAtEarliestWeek ? "not-allowed" : "pointer",
            }}
          >
            ←
          </button>

          <div style={weekLabelStyle}>
            Неделя: <strong>{formatWeekLabel(selectedWeekStart)}</strong>
            {isViewingCurrentWeek && (
              <span style={weekCurrentTagStyle}> (текущая)</span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setSelectedWeekStart(addDays(selectedWeekStart, 7))}
            disabled={isViewingCurrentWeek}
            style={{
              ...weekNavButtonStyle,
              opacity: isViewingCurrentWeek ? 0.4 : 1,
              cursor: isViewingCurrentWeek ? "not-allowed" : "pointer",
            }}
          >
            →
          </button>

          {!isViewingCurrentWeek && (
            <button
              type="button"
              onClick={() => setSelectedWeekStart(currentWeekStart)}
              style={weekTodayButtonStyle}
            >
              Текущая неделя
            </button>
          )}

          <div style={weekJumpStyle}>
            <label style={weekJumpLabelStyle}>Перейти к дате:</label>
            <input
              type="date"
              min={toDateInputValue(earliestVehicleDate)}
              max={toDateInputValue(new Date())}
              onChange={(e) => {
                if (!e.target.value) return;

                let target = getMonday(parseDateInputValue(e.target.value));

                if (target.getTime() < minWeekStart.getTime()) {
                  target = minWeekStart;
                } else if (target.getTime() > currentWeekStart.getTime()) {
                  target = currentWeekStart;
                }

                setSelectedWeekStart(target);
              }}
              style={weekDateInputStyle}
            />
          </div>
        </div>

        <div style={legendStyle}>
          <LegendItem color="#fef9c3" label="8–14 дней без обновления пробега" />
          <LegendItem color="#fecaca" label="15–29 дней без обновления пробега" />
          <LegendItem
            color="#fca5a5"
            label="30+ дней — нужно уведомить директора"
          />
        </div>

        <div style={tableCardStyle}>
          <div style={tableScrollStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Гос. номер</th>
                  <th style={thStyle}>Автомобиль</th>
                  <th style={thStyle}>Пробег на начало недели</th>
                  <th style={thStyle}>Пробег за неделю</th>
                  <th style={thStyle}>Ближайшее ТО</th>
                </tr>
              </thead>

              <tbody>
                {vehicles.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={emptyTableStyle}>
                      Автомобилей пока нет
                    </td>
                  </tr>
                ) : (
                  vehicles.map((vehicle) => {
                    const staleness = getStaleness(vehicle);
                    const week = getWeekData(vehicle);
                    const nearestMaintenance = getNearestMaintenance(vehicle);

                    return (
                      <tr
                        key={vehicle.id}
                        style={getRowStyle(staleness.level)}
                      >
                        <td style={tdStyle}>{vehicle.plate_number}</td>

                        <td style={tdStyle}>
                          {vehicle.make} {vehicle.model}
                        </td>

                        <td style={tdStyle}>
                          {week.previousEntry ? (
                            <>
                              {week.previousEntry.mileage.toLocaleString(
                                "ru-RU"
                              )}{" "}
                              км
                              <div style={fadedNoteStyle}>
                                {formatDate(week.previousEntry.recorded_at)}
                              </div>
                            </>
                          ) : (
                            <span style={fadedNoteStyle}>нет данных</span>
                          )}
                        </td>

                        <td style={tdInputStyle}>
                          {week.entryThisWeek ? (
                            <div
                              style={
                                isViewingCurrentWeek
                                  ? enteredBadgeStyle
                                  : pastEntryStyle
                              }
                            >
                              {week.entryThisWeek.mileage.toLocaleString(
                                "ru-RU"
                              )}{" "}
                              км{isViewingCurrentWeek ? " ✓" : ""}
                            </div>
                          ) : isViewingCurrentWeek ? (
                            <>
                              <div style={inputRowStyle}>
                                <input
                                  type="number"
                                  min={vehicle.current_mileage}
                                  value={inputValues[vehicle.id] || ""}
                                  onChange={(e) =>
                                    setInputValues((prev) => ({
                                      ...prev,
                                      [vehicle.id]: e.target.value,
                                    }))
                                  }
                                  placeholder="км"
                                  style={mileageInputStyle}
                                  disabled={!canEdit}
                                />

                                {canEdit && (
                                  <button
                                    type="button"
                                    disabled={savingId === vehicle.id}
                                    onClick={() => handleSave(vehicle)}
                                    style={saveButtonStyle}
                                  >
                                    {savingId === vehicle.id
                                      ? "Сохраняем..."
                                      : "Сохранить"}
                                  </button>
                                )}
                              </div>

                              <div style={statusLabelStyle(staleness.level)}>
                                {staleness.days} дн. назад
                                {staleness.level === "critical" &&
                                  " — нужно уведомить директора"}
                              </div>

                              {rowErrors[vehicle.id] && (
                                <div style={rowErrorStyle}>
                                  {rowErrors[vehicle.id]}
                                </div>
                              )}
                            </>
                          ) : (
                            <span style={fadedNoteStyle}>не внесено</span>
                          )}
                        </td>

                        <td style={tdStyle}>
                          {nearestMaintenance ? (
                            <span
                              style={maintenanceLabelStyle(
                                getMaintenanceLevel(
                                  nearestMaintenance.remaining
                                )
                              )}
                            >
                              {nearestMaintenance.remaining < 0
                                ? `просрочено на ${Math.abs(
                                    nearestMaintenance.remaining
                                  ).toLocaleString("ru-RU")} км`
                                : `через ${nearestMaintenance.remaining.toLocaleString(
                                    "ru-RU"
                                  )} км`}
                            </span>
                          ) : (
                            <span style={fadedNoteStyle}>—</span>
                          )}

                          <div>
                            <button
                              type="button"
                              onClick={() =>
                                router.push(`/vehicles/${vehicle.id}/maintenance`)
                              }
                              style={maintenanceLinkStyle}
                            >
                              ТО
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div style={legendItemStyle}>
      <span style={{ ...legendSwatchStyle, background: color }} />
      {label}
    </div>
  );
}

function getRowStyle(level: "ok" | "yellow" | "red" | "critical") {
  if (level === "yellow") return { ...trBaseStyle, background: "#fef9c3" };
  if (level === "red") return { ...trBaseStyle, background: "#fecaca" };
  if (level === "critical") return { ...trBaseStyle, background: "#fca5a5" };
  return trBaseStyle;
}

function statusLabelStyle(level: "ok" | "yellow" | "red" | "critical") {
  if (level === "ok") return { color: "#9ca3af", fontSize: "12px" };
  if (level === "critical")
    return { color: "#991b1b", fontSize: "12px", fontWeight: 700 };
  return { color: "#7f1d1d", fontSize: "12px", fontWeight: 600 };
}

function maintenanceLabelStyle(level: "ok" | "yellow" | "red" | "overdue") {
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

const weekBarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "12px",
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: "10px",
  padding: "12px 16px",
  marginBottom: "14px",
  fontSize: "14px",
  color: "#374151",
};

const weekNavButtonStyle: React.CSSProperties = {
  width: "34px",
  height: "34px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  background: "#ffffff",
  fontSize: "15px",
  cursor: "pointer",
};

const weekLabelStyle: React.CSSProperties = {
  fontSize: "14px",
};

const weekCurrentTagStyle: React.CSSProperties = {
  color: "#9ca3af",
  fontWeight: 400,
};

const weekTodayButtonStyle: React.CSSProperties = {
  height: "34px",
  padding: "0 12px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  background: "#ffffff",
  fontSize: "13px",
  cursor: "pointer",
};

const weekJumpStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  marginLeft: "auto",
};

const weekJumpLabelStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#6b7280",
};

const weekDateInputStyle: React.CSSProperties = {
  height: "34px",
  padding: "0 10px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  fontSize: "13px",
};

const legendStyle: React.CSSProperties = {
  display: "flex",
  gap: "18px",
  flexWrap: "wrap",
  marginBottom: "18px",
};

const legendItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  fontSize: "13px",
  color: "#6b7280",
};

const legendSwatchStyle: React.CSSProperties = {
  width: "14px",
  height: "14px",
  borderRadius: "4px",
  display: "inline-block",
  border: "1px solid rgba(0,0,0,0.08)",
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
  minWidth: "1000px",
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

const tdInputStyle: React.CSSProperties = {
  padding: "10px 16px",
  textAlign: "left",
  borderBottom: "1px solid #f0f1f3",
  whiteSpace: "nowrap",
};

const inputRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  alignItems: "center",
};

const mileageInputStyle: React.CSSProperties = {
  width: "110px",
  height: "36px",
  padding: "0 10px",
  border: "1px solid #d1d5db",
  borderRadius: "6px",
  fontSize: "14px",
};

const saveButtonStyle: React.CSSProperties = {
  height: "36px",
  padding: "0 14px",
  border: "none",
  borderRadius: "6px",
  background: "#2563eb",
  color: "#ffffff",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
};

const enteredBadgeStyle: React.CSSProperties = {
  color: "#16a34a",
  fontWeight: 700,
  fontSize: "14px",
};

const pastEntryStyle: React.CSSProperties = {
  color: "#111827",
  fontSize: "14px",
};

const fadedNoteStyle: React.CSSProperties = {
  color: "#9ca3af",
  fontSize: "12px",
};

const rowErrorStyle: React.CSSProperties = {
  marginTop: "6px",
  fontSize: "12px",
  color: "#dc2626",
};

const maintenanceLinkStyle: React.CSSProperties = {
  marginTop: "4px",
  height: "26px",
  padding: "0 10px",
  border: "1px solid #d1d5db",
  borderRadius: "6px",
  background: "#ffffff",
  color: "#111827",
  fontSize: "11px",
  cursor: "pointer",
};

const emptyTableStyle: React.CSSProperties = {
  padding: "36px 16px",
  textAlign: "center",
  fontSize: "14px",
  color: "#9ca3af",
};
