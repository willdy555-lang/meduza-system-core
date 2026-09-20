"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

type RentalSummary = {
  id: string;
  status: string;
  started_at: string;
  vehicle_id: string;
  vehicle: {
    plate_number: string;
    make: string;
    model: string;
  } | null;
  driver: {
    last_name: string;
    first_name: string;
  } | null;
};

type Adjustment = {
  id: string;
  adjustment_date: string;
  days: number;
  reason: string | null;
};

type DraftRow = {
  date: string;
  reason: string;
  half: boolean;
};

function emptyRow(): DraftRow {
  return { date: "", reason: "", half: false };
}

function formatDateOnly(value: string) {
  // value приходит как "YYYY-MM-DD" из базы
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

function formatDays(value: number) {
  return value.toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
}

function pad2(value: number) {
  return value.toString().padStart(2, "0");
}

function toDateValue(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate()
  )}`;
}

function todayDateValue() {
  return toDateValue(new Date());
}

export default function AdjustRentalDaysPage() {
  const router = useRouter();
  const params = useParams();
  const rentalId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [rental, setRental] = useState<RentalSummary | null>(null);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);

  const [rows, setRows] = useState<DraftRow[]>([emptyRow()]);

  useEffect(() => {
    loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPage() {
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

    const { data: rentalData, error: rentalError } = await supabase
      .from("rentals")
      .select(
        `
        id,
        status,
        started_at,
        vehicle_id,
        vehicle:vehicles ( plate_number, make, model ),
        driver:drivers ( last_name, first_name )
      `
      )
      .eq("id", rentalId)
      .single();

    if (rentalError || !rentalData) {
      console.error(rentalError);
      setErrorMessage("Аренда не найдена.");
      setRental(null);
      setLoading(false);
      return;
    }

    setRental(rentalData as unknown as RentalSummary);

    await loadAdjustments();

    setLoading(false);
  }

  async function loadAdjustments() {
    const { data: adjustmentRows, error: adjustmentError } = await supabase
      .from("rental_day_adjustments")
      .select("id, adjustment_date, days, reason")
      .eq("rental_id", rentalId)
      .order("adjustment_date", { ascending: false });

    if (adjustmentError) {
      console.error(adjustmentError);
      setAdjustments([]);
    } else {
      setAdjustments(adjustmentRows || []);
    }
  }

  function updateRow(index: number, patch: Partial<DraftRow>) {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
  }

  function addRow() {
    setRows((prev) => [...prev, emptyRow()]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  const minDateValue = rental
    ? toDateValue(new Date(rental.started_at))
    : undefined;
  const maxDateValue = todayDateValue();

  const validRows = rows.filter(
    (row) => row.date.trim().length > 0 && row.reason.trim().length > 0
  );

  const hasIncompleteRow = rows.some(
    (row) =>
      (row.date.trim().length > 0) !== (row.reason.trim().length > 0)
  );

  const hasOutOfRangeDate = validRows.some(
    (row) =>
      (minDateValue && row.date < minDateValue) ||
      (maxDateValue && row.date > maxDateValue)
  );

  const canSubmit =
    !!rental &&
    validRows.length > 0 &&
    !hasIncompleteRow &&
    !hasOutOfRangeDate &&
    !submitting;

  async function handleAddAdjustment() {
    if (!rental || validRows.length === 0) return;

    if (hasIncompleteRow) {
      setErrorMessage("Укажите причину для каждой выбранной даты.");
      return;
    }

    if (hasOutOfRangeDate) {
      setErrorMessage(
        "Можно выбрать только дату в пределах этой аренды — от даты начала и не позже сегодняшнего дня."
      );
      return;
    }

    setSubmitting(true);
    setErrorMessage("");

    const { data: closures, error: closureError } = await supabase
      .from("rent_week_closures")
      .select("week_start, week_end");

    if (closureError) {
      console.error(closureError);
    } else {
      const closedRow = validRows.find((row) =>
        (closures || []).some(
          (closure) =>
            row.date >= closure.week_start && row.date <= closure.week_end
        )
      );

      if (closedRow) {
        setErrorMessage(
          `Неделя, в которую входит дата ${formatDateOnly(
            closedRow.date
          )}, уже закрыта — внести изменения за эту дату нельзя.`
        );
        setSubmitting(false);
        return;
      }
    }

    const payload = validRows.map((row) => ({
      rental_id: rental.id,
      adjustment_date: row.date,
      days: row.half ? 0.5 : 1,
      reason: row.reason.trim() || null,
    }));

    const { error: insertError } = await supabase
      .from("rental_day_adjustments")
      .insert(payload);

    if (insertError) {
      console.error(insertError);
      setErrorMessage("Не удалось списать дни. Попробуйте ещё раз.");
      setSubmitting(false);
      return;
    }

    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();

    await supabase.from("vehicle_events").insert({
      vehicle_id: rental.vehicle_id,
      event_type: "rental_day_adjustment",
      title: "Списаны дни аренды",
      description: validRows
        .map(
          (row) =>
            `${formatDateOnly(row.date)}${row.half ? " (0.5 дня)" : ""} — ${
              row.reason.trim() || "без причины"
            }`
        )
        .join("; "),
      actor_id: currentUser?.id ?? null,
      payload: { rental_id: rental.id, dates: validRows.map((r) => r.date) },
    });

    setRows([emptyRow()]);
    await loadAdjustments();
    setSubmitting(false);
  }

  const totalDeducted = adjustments.reduce(
    (sum, adjustment) => sum + Number(adjustment.days),
    0
  );

  if (loading) {
    return <main style={loadingStyle}>Загрузка...</main>;
  }

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <div style={headerStyle}>
          <div>
            <div style={systemTitleStyle}>MEDUZA SYSTEM</div>

            <h1 style={titleStyle}>Списание дней аренды</h1>
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
              onClick={() => router.push("/rent")}
              style={secondaryButtonStyle}
            >
              ← Назад
            </button>
          </div>
        </div>

        <div style={formCardStyle}>
          {!rental ? (
            <div style={errorBoxStyle}>
              {errorMessage || "Аренда не найдена."}
            </div>
          ) : (
            <>
              <div style={summaryBlockStyle}>
                <div style={summaryRowStyle}>
                  <span style={summaryLabelStyle}>Автомобиль</span>

                  <span style={summaryValueStyle}>
                    {rental.vehicle
                      ? `${rental.vehicle.plate_number} — ${rental.vehicle.make} ${rental.vehicle.model}`
                      : "—"}
                  </span>
                </div>

                <div style={summaryRowStyle}>
                  <span style={summaryLabelStyle}>Водитель</span>

                  <span style={summaryValueStyle}>
                    {rental.driver
                      ? `${rental.driver.last_name} ${rental.driver.first_name}`
                      : "—"}
                  </span>
                </div>

                <div style={summaryRowStyle}>
                  <span style={summaryLabelStyle}>Уже списано дней</span>

                  <span style={summaryValueStyle}>
                    {totalDeducted > 0 ? formatDays(totalDeducted) : "—"}
                  </span>
                </div>
              </div>

              <div style={rowsBlockStyle}>
                {rows.map((row, index) => (
                  <div key={index} style={draftRowStyle}>
                    <div style={dateFieldStyle}>
                      {index === 0 && (
                        <label style={labelStyle}>Дата *</label>
                      )}

                      <input
                        type="date"
                        value={row.date}
                        min={minDateValue}
                        max={maxDateValue}
                        onChange={(e) =>
                          updateRow(index, { date: e.target.value })
                        }
                        style={compactInputStyle}
                      />
                    </div>

                    <div style={reasonFieldStyle}>
                      {index === 0 && (
                        <label style={labelStyle}>Причина *</label>
                      )}

                      <input
                        type="text"
                        placeholder="например: поломка"
                        value={row.reason}
                        onChange={(e) =>
                          updateRow(index, { reason: e.target.value })
                        }
                        style={compactInputStyle}
                      />
                    </div>

                    <div style={halfFieldStyle}>
                      {index === 0 && (
                        <label style={labelStyle}>&nbsp;</label>
                      )}

                      <label style={halfCheckboxLabelStyle}>
                        <input
                          type="checkbox"
                          checked={row.half}
                          onChange={(e) =>
                            updateRow(index, { half: e.target.checked })
                          }
                          style={checkboxInputStyle}
                        />
                        Полдня
                      </label>
                    </div>

                    <div style={removeFieldStyle}>
                      {index === 0 && (
                        <label style={labelStyle}>&nbsp;</label>
                      )}

                      {rows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRow(index)}
                          style={removeButtonStyle}
                          aria-label="Удалить строку"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                <button type="button" onClick={addRow} style={addRowButtonStyle}>
                  + Добавить ещё дату
                </button>
              </div>

              {errorMessage && (
                <div style={errorBoxStyle}>{errorMessage}</div>
              )}

              <div style={footerStyle}>
                <button
                  type="button"
                  disabled={!canSubmit}
                  onClick={handleAddAdjustment}
                  style={{
                    ...saveButtonStyle,
                    background: canSubmit ? "#2563eb" : "#9ca3af",
                    cursor: canSubmit ? "pointer" : "not-allowed",
                  }}
                >
                  {submitting ? "Списываем..." : "Списать"}
                </button>
              </div>

              <div style={historyBlockStyle}>
                <div style={historyTitleStyle}>История списаний</div>

                {adjustments.length === 0 ? (
                  <div style={emptyHistoryStyle}>Списаний пока не было</div>
                ) : (
                  adjustments.map((adjustment) => (
                    <div key={adjustment.id} style={historyRowStyle}>
                      <div style={historyDateStyle}>
                        {formatDateOnly(adjustment.adjustment_date)}
                      </div>

                      <div style={historyDaysStyle}>
                        −{formatDays(Number(adjustment.days))} дн.
                      </div>

                      <div style={historyReasonStyle}>
                        {adjustment.reason || "—"}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
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
  maxWidth: "820px",
  margin: "0 auto",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "28px",
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

const formCardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  padding: "24px",
};

const summaryBlockStyle: React.CSSProperties = {
  background: "#f9fafb",
  border: "1px solid #f0f1f3",
  borderRadius: "8px",
  padding: "14px 16px",
  marginBottom: "20px",
};

const summaryRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "16px",
  padding: "5px 0",
  fontSize: "14px",
};

const summaryLabelStyle: React.CSSProperties = {
  color: "#6b7280",
};

const summaryValueStyle: React.CSSProperties = {
  color: "#111827",
  fontWeight: 600,
  textAlign: "right",
};

const rowsBlockStyle: React.CSSProperties = {
  marginBottom: "18px",
};

const draftRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "12px",
  alignItems: "flex-end",
  marginBottom: "12px",
};

const dateFieldStyle: React.CSSProperties = {
  width: "170px",
};

const reasonFieldStyle: React.CSSProperties = {
  flex: "1",
  minWidth: "200px",
};

const halfFieldStyle: React.CSSProperties = {
  width: "100px",
};

const removeFieldStyle: React.CSSProperties = {
  width: "34px",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "7px",
  fontSize: "13px",
  fontWeight: 600,
  color: "#374151",
};

const compactInputStyle: React.CSSProperties = {
  width: "100%",
  height: "42px",
  boxSizing: "border-box",
  padding: "0 12px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  fontSize: "14px",
  outline: "none",
};

const halfCheckboxLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  height: "42px",
  fontSize: "13px",
  color: "#374151",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const checkboxInputStyle: React.CSSProperties = {
  width: "16px",
  height: "16px",
  cursor: "pointer",
};

const removeButtonStyle: React.CSSProperties = {
  width: "34px",
  height: "42px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  background: "#ffffff",
  color: "#9ca3af",
  fontSize: "14px",
  cursor: "pointer",
};

const addRowButtonStyle: React.CSSProperties = {
  height: "38px",
  padding: "0 14px",
  border: "1px dashed #d1d5db",
  borderRadius: "8px",
  background: "#ffffff",
  color: "#2563eb",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
};

const errorBoxStyle: React.CSSProperties = {
  marginBottom: "20px",
  padding: "12px 14px",
  borderRadius: "8px",
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#b91c1c",
  fontSize: "13px",
};

const footerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
};

const saveButtonStyle: React.CSSProperties = {
  height: "44px",
  padding: "0 20px",
  border: "none",
  borderRadius: "8px",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: 600,
};

const historyBlockStyle: React.CSSProperties = {
  marginTop: "28px",
  borderTop: "1px solid #f0f1f3",
  paddingTop: "18px",
};

const historyTitleStyle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 700,
  marginBottom: "10px",
};

const emptyHistoryStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#9ca3af",
  padding: "8px 0",
};

const historyRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "14px",
  padding: "9px 0",
  borderBottom: "1px solid #f5f5f6",
  fontSize: "13px",
};

const historyDateStyle: React.CSSProperties = {
  color: "#9ca3af",
  width: "90px",
  flexShrink: 0,
};

const historyDaysStyle: React.CSSProperties = {
  fontWeight: 700,
  color: "#b91c1c",
  width: "70px",
  flexShrink: 0,
};

const historyReasonStyle: React.CSSProperties = {
  color: "#111827",
  flex: 1,
};
