"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

type RentalDetails = {
  id: string;
  vehicle_id: string;
  weekly_price: number;
  started_at: string;
  status: string;
  first_day_half_price: boolean;
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

function nowTimeValue() {
  const now = new Date();
  return `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
}

// Правило расчёта дней аренды (подтверждено с заказчиком):
// - день начала аренды всегда считается полным днём;
// - каждый день между началом и возвратом — тоже полный день;
// - день возврата добавляется ещё одним днём, ТОЛЬКО если машину
//   вернули после 12:00. Если вернули до 12:00 включительно — день
//   возврата не считается.
function calculateBillableDays(startedAt: Date, endedAt: Date) {
  const startDateOnly = new Date(
    startedAt.getFullYear(),
    startedAt.getMonth(),
    startedAt.getDate()
  );

  const endDateOnly = new Date(
    endedAt.getFullYear(),
    endedAt.getMonth(),
    endedAt.getDate()
  );

  const msPerDay = 24 * 60 * 60 * 1000;
  const baseDays = Math.round(
    (endDateOnly.getTime() - startDateOnly.getTime()) / msPerDay
  );

  const noonCutoff = new Date(
    endedAt.getFullYear(),
    endedAt.getMonth(),
    endedAt.getDate(),
    12,
    0,
    0
  );

  const returnedAfterNoon = endedAt.getTime() > noonCutoff.getTime();

  return Math.max(baseDays + (returnedAfterNoon ? 1 : 0), 0);
}

function formatMoney(amount: number) {
  return `${amount.toLocaleString("pl-PL")} zł`;
}

export default function EndRentalPage() {
  const router = useRouter();
  const params = useParams();
  const rentalId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [rental, setRental] = useState<RentalDetails | null>(null);
  const [depositBalance, setDepositBalance] = useState(0);
  const [deductedDays, setDeductedDays] = useState(0);

  const [endDate, setEndDate] = useState(todayDateValue());
  const [endTime, setEndTime] = useState(nowTimeValue());
  const [returnDeposit, setReturnDeposit] = useState(true);
  const [lastDayHalfPrice, setLastDayHalfPrice] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState("");

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

    setUserRole(profile.role);

    const { data: rentalData, error: rentalError } = await supabase
      .from("rentals")
      .select(
        `
        id,
        vehicle_id,
        weekly_price,
        started_at,
        status,
        first_day_half_price,
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

    const rentalRow = rentalData as unknown as RentalDetails;

    if (rentalRow.status !== "active") {
      setErrorMessage("Эта аренда уже завершена.");
      setRental(rentalRow);
      setLoading(false);
      return;
    }

    setRental(rentalRow);

    const { data: depositRows, error: depositError } = await supabase
      .from("deposit_transactions")
      .select("type, amount")
      .eq("rental_id", rentalId);

    if (depositError) {
      console.error(depositError);
      setDepositBalance(0);
    } else {
      const balance = (depositRows || []).reduce((sum, row) => {
        const sign = row.type === "received" ? 1 : -1;
        return sum + sign * Number(row.amount);
      }, 0);

      setDepositBalance(balance);
      setReturnDeposit(balance > 0);
    }

    const { data: adjustmentRows, error: adjustmentError } = await supabase
      .from("rental_day_adjustments")
      .select("days")
      .eq("rental_id", rentalId);

    if (adjustmentError) {
      console.error(adjustmentError);
      setDeductedDays(0);
    } else {
      const total = (adjustmentRows || []).reduce(
        (sum, row) => sum + Number(row.days),
        0
      );
      setDeductedDays(total);
    }

    setLoading(false);
  }

  const endDateTime =
    endDate && endTime ? new Date(`${endDate}T${endTime}`) : null;

  const startDateTime = rental ? new Date(rental.started_at) : null;

  const isEndBeforeStart =
    !!endDateTime && !!startDateTime && endDateTime.getTime() < startDateTime.getTime();

  const rawBillableDays =
    endDateTime && startDateTime && !isEndBeforeStart
      ? calculateBillableDays(startDateTime, endDateTime)
      : 0;

  const halfDayDiscount =
    (rental?.first_day_half_price ? 0.5 : 0) + (lastDayHalfPrice ? 0.5 : 0);

  const billableDays = Math.max(
    rawBillableDays - halfDayDiscount - deductedDays,
    0
  );

  const rentalAmount = rental
    ? Math.round(((rental.weekly_price / 7) * billableDays) * 100) / 100
    : 0;

  const depositToReturn = returnDeposit ? depositBalance : 0;

  const canSubmit =
    !!rental &&
    rental.status === "active" &&
    endDate.trim().length > 0 &&
    endTime.trim().length > 0 &&
    !isEndBeforeStart &&
    !submitting;

  const isSameDayAsStart =
    !!startDateTime && toDateValue(startDateTime) === todayDateValue();

  const isUnrestrictedDeleteRole =
    userRole === "director" || userRole === "administrator";

  const canDelete =
    !!rental &&
    rental.status === "active" &&
    (isUnrestrictedDeleteRole ||
      (userRole === "rental_manager" && isSameDayAsStart));

  async function downloadReturnAct(rentalId: string) {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) return;

      const response = await fetch(
        `/api/rent/${rentalId}/act?type=return`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (!response.ok) {
        console.error("Не удалось скачать акт возврата:", await response.text());
        return;
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/);
      const fileName = match ? match[1] : "akt_vozvrata.docx";

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Не удалось скачать акт возврата:", err);
    }
  }

  async function handleEndRental() {
    if (!rental || !canSubmit || !endDateTime) return;

    setSubmitting(true);
    setErrorMessage("");

    const endDateKey = toDateValue(endDateTime);

    const { data: closures, error: closureError } = await supabase
      .from("rent_week_closures")
      .select("week_start, week_end");

    if (closureError) {
      console.error(closureError);
    } else {
      const isClosed = (closures || []).some(
        (closure) =>
          endDateKey >= closure.week_start && endDateKey <= closure.week_end
      );

      if (isClosed) {
        setErrorMessage(
          "Неделя, в которую входит дата окончания, уже закрыта — завершить аренду этой датой нельзя. Выбери дату из текущей (незакрытой) недели."
        );
        setSubmitting(false);
        return;
      }
    }

    const { error: updateError } = await supabase
      .from("rentals")
      .update({
        ended_at: endDateTime.toISOString(),
        status: "completed",
        final_amount: rentalAmount,
      })
      .eq("id", rental.id)
      .eq("status", "active");

    if (updateError) {
      console.error(updateError);
      setErrorMessage("Не удалось завершить аренду. Попробуйте ещё раз.");
      setSubmitting(false);
      return;
    }

    if (returnDeposit && depositBalance > 0) {
      const { error: depositError } = await supabase
        .from("deposit_transactions")
        .insert({
          rental_id: rental.id,
          type: "returned",
          amount: depositBalance,
        });

      if (depositError) {
        console.error(depositError);
      }
    }

    const { error: vehicleUpdateError } = await supabase
      .from("vehicles")
      .update({ status: "free" })
      .eq("id", rental.vehicle_id);

    if (vehicleUpdateError) {
      console.error(vehicleUpdateError);
    }

    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();

    await supabase.from("vehicle_events").insert({
      vehicle_id: rental.vehicle_id,
      event_type: "rental_ended",
      title: "Завершена аренда",
      description: `Сумма: ${formatMoney(rentalAmount)}; депозит ${
        returnDeposit && depositBalance > 0
          ? `возвращён (${formatMoney(depositBalance)})`
          : "не возвращён"
      }`,
      actor_id: currentUser?.id ?? null,
      payload: { rental_id: rental.id, final_amount: rentalAmount },
    });

    await downloadReturnAct(rental.id);

    router.replace("/rent");
  }

  async function handleDeleteRental() {
    if (!rental || !canDelete) return;

    setDeleting(true);
    setDeleteError("");

    const { error: vehicleUpdateError } = await supabase
      .from("vehicles")
      .update({ status: "free" })
      .eq("id", rental.vehicle_id);

    if (vehicleUpdateError) {
      console.error(vehicleUpdateError);
    }

    const { error: deleteError } = await supabase
      .from("rentals")
      .delete()
      .eq("id", rental.id)
      .eq("status", "active");

    if (deleteError) {
      console.error(deleteError);
      setDeleteError("Не удалось удалить аренду. Попробуйте ещё раз.");
      setDeleting(false);
      return;
    }

    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();

    await supabase.from("vehicle_events").insert({
      vehicle_id: rental.vehicle_id,
      event_type: "rental_deleted",
      title: "Аренда удалена",
      description: "Ошибочно созданная аренда удалена из системы.",
      actor_id: currentUser?.id ?? null,
      payload: { rental_id: rental.id },
    });

    router.replace("/rent");
  }

  if (loading) {
    return <main style={loadingStyle}>Загрузка...</main>;
  }

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <div style={headerStyle}>
          <div>
            <div style={systemTitleStyle}>MEDUZA SYSTEM</div>

            <h1 style={titleStyle}>Завершение аренды</h1>
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
          ) : rental.status !== "active" ? (
            <div style={errorBoxStyle}>
              {errorMessage || "Эта аренда уже завершена."}
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
                  <span style={summaryLabelStyle}>Начало аренды</span>

                  <span style={summaryValueStyle}>
                    {startDateTime
                      ? `${startDateTime.toLocaleDateString(
                          "ru-RU"
                        )} ${pad2(startDateTime.getHours())}:${pad2(
                          startDateTime.getMinutes()
                        )}`
                      : "—"}
                  </span>
                </div>

                <div style={summaryRowStyle}>
                  <span style={summaryLabelStyle}>Депозит внесён</span>

                  <span style={summaryValueStyle}>
                    {depositBalance > 0 ? formatMoney(depositBalance) : "—"}
                  </span>
                </div>
              </div>

              <div style={compactRowStyle}>
                <div style={compactFieldStyle}>
                  <label style={labelStyle}>Дата окончания аренды *</label>

                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    style={compactInputStyle}
                  />
                </div>

                <div style={compactFieldStyle}>
                  <label style={labelStyle}>Время окончания аренды *</label>

                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    style={compactInputStyle}
                  />
                </div>
              </div>

              {depositBalance > 0 && (
                <label style={checkboxRowStyle}>
                  <input
                    type="checkbox"
                    checked={returnDeposit}
                    onChange={(e) => setReturnDeposit(e.target.checked)}
                    style={checkboxInputStyle}
                  />
                  Вернуть депозит водителю ({formatMoney(depositBalance)})
                </label>
              )}

              <label style={checkboxRowStyle}>
                <input
                  type="checkbox"
                  checked={lastDayHalfPrice}
                  onChange={(e) => setLastDayHalfPrice(e.target.checked)}
                  style={checkboxInputStyle}
                />
                Последний день — 50% (скидка на день окончания аренды)
              </label>

              {rental?.first_day_half_price && (
                <div style={noticeTextStyle}>
                  При открытии этой аренды уже была отмечена скидка 50% на
                  первый день — она учтена в расчёте ниже.
                </div>
              )}

              {isEndBeforeStart ? (
                <div style={errorBoxStyle}>
                  Дата и время окончания не могут быть раньше начала аренды.
                </div>
              ) : (
                <div style={summaryBlockStyle}>
                  {deductedDays > 0 && (
                    <div style={summaryRowStyle}>
                      <span style={summaryLabelStyle}>
                        Списано дней (корректировки)
                      </span>

                      <span style={summaryValueStyle}>−{deductedDays}</span>
                    </div>
                  )}

                  <div style={summaryRowStyle}>
                    <span style={summaryLabelStyle}>Дней в аренде</span>

                    <span style={summaryValueStyle}>{billableDays}</span>
                  </div>

                  <div style={summaryRowStyle}>
                    <span style={summaryLabelStyle}>К оплате за аренду</span>

                    <span style={summaryValueStyle}>
                      {formatMoney(rentalAmount)}
                    </span>
                  </div>

                  <div style={summaryRowStyle}>
                    <span style={summaryLabelStyle}>Депозит к возврату</span>

                    <span style={summaryValueStyle}>
                      {depositToReturn > 0
                        ? formatMoney(depositToReturn)
                        : "—"}
                    </span>
                  </div>
                </div>
              )}

              {errorMessage && (
                <div style={errorBoxStyle}>{errorMessage}</div>
              )}

              <div style={footerStyle}>
                <button
                  type="button"
                  disabled={!canSubmit}
                  onClick={handleEndRental}
                  style={{
                    ...saveButtonStyle,
                    background: canSubmit ? "#2563eb" : "#9ca3af",
                    cursor: canSubmit ? "pointer" : "not-allowed",
                  }}
                >
                  {submitting ? "Завершаем..." : "Завершить аренду"}
                </button>
              </div>

              {canDelete && (
                <div style={dangerZoneStyle}>
                  {!confirmingDelete ? (
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(true)}
                      style={deleteLinkButtonStyle}
                    >
                      Удалить аренду (ошиблись автомобилем или водителем)
                    </button>
                  ) : (
                    <div style={confirmBoxStyle}>
                      <div style={confirmTextStyle}>
                        Аренда будет удалена полностью, вместе с депозитом и
                        списаниями по ней. Автомобиль станет «Свободен».
                        Отменить это будет нельзя.
                      </div>

                      {deleteError && (
                        <div style={errorBoxStyle}>{deleteError}</div>
                      )}

                      <div style={confirmButtonsRowStyle}>
                        <button
                          type="button"
                          onClick={() => setConfirmingDelete(false)}
                          style={secondaryButtonStyle}
                          disabled={deleting}
                        >
                          Отмена
                        </button>

                        <button
                          type="button"
                          onClick={handleDeleteRental}
                          style={confirmDeleteButtonStyle}
                          disabled={deleting}
                        >
                          {deleting ? "Удаляем..." : "Да, удалить аренду"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
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
  maxWidth: "760px",
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

const compactRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "16px",
  marginBottom: "18px",
};

const compactFieldStyle: React.CSSProperties = {
  width: "220px",
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

const checkboxRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  fontSize: "14px",
  color: "#111827",
  marginBottom: "18px",
  cursor: "pointer",
};

const checkboxInputStyle: React.CSSProperties = {
  width: "16px",
  height: "16px",
  cursor: "pointer",
};

const noticeTextStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#6b7280",
  marginBottom: "18px",
};

const dangerZoneStyle: React.CSSProperties = {
  marginTop: "24px",
  paddingTop: "18px",
  borderTop: "1px solid #f0f1f3",
  textAlign: "right",
};

const deleteLinkButtonStyle: React.CSSProperties = {
  height: "34px",
  padding: "0 4px",
  border: "none",
  background: "none",
  color: "#b91c1c",
  fontSize: "13px",
  cursor: "pointer",
  textDecoration: "underline",
};

const confirmBoxStyle: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: "8px",
  background: "#fef2f2",
  border: "1px solid #fecaca",
  textAlign: "left",
};

const confirmTextStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#7f1d1d",
  marginBottom: "14px",
};

const confirmButtonsRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "10px",
};

const confirmDeleteButtonStyle: React.CSSProperties = {
  height: "42px",
  padding: "0 16px",
  border: "none",
  borderRadius: "8px",
  background: "#dc2626",
  color: "#ffffff",
  fontSize: "14px",
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
  gap: "10px",
  marginTop: "24px",
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
