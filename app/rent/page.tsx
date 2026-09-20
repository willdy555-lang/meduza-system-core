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
  status: string;
};

type RentalRow = {
  id: string;
  weekly_price: number;
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

type VehicleForClosure = {
  id: string;
  status: string;
  created_at: string;
  plate_number: string;
  make: string;
  model: string;
};

type RentalForClosure = {
  id: string;
  vehicle_id: string;
  weekly_price: number;
  started_at: string;
  ended_at: string | null;
  status: string;
  final_amount: number | null;
  first_day_half_price: boolean;
  driver: { last_name: string; first_name: string } | null;
};

type AdjustmentForClosure = {
  rental_id: string;
  adjustment_date: string;
  days: number;
};

type DepositForClosure = {
  rental_id: string;
  type: string;
  amount: number;
};

type WeekClosure = {
  id: string;
  week_start: string;
  week_end: string;
  closed_by_name: string | null;
  closed_at: string;
};

export default function RentPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [rentals, setRentals] = useState<RentalRow[]>([]);
  const [depositByRental, setDepositByRental] = useState<
    Record<string, number>
  >({});

  const [lastWeekClosure, setLastWeekClosure] = useState<WeekClosure | null>(
    null
  );
  const [closureLoading, setClosureLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [closeError, setCloseError] = useState("");
  const [generatingContractId, setGeneratingContractId] = useState("");
  const [contractError, setContractError] = useState("");

  useEffect(() => {
    loadPage();
    loadLastWeekClosure();
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

    const { data: vehicleData, error: vehicleError } = await supabase
      .from("vehicles")
      .select("id, status")
      .is("archived_at", null)
      .eq("vehicle_scope", "partner");

    if (vehicleError) {
      console.error(vehicleError);
      setVehicles([]);
    } else {
      setVehicles(vehicleData || []);
    }

    const { data: rentalData, error: rentalError } = await supabase
      .from("rentals")
      .select(
        `
        id,
        weekly_price,
        vehicle:vehicles ( plate_number, make, model ),
        driver:drivers ( last_name, first_name )
      `
      )
      .eq("status", "active")
      .order("started_at", { ascending: false });

    if (rentalError) {
      console.error(rentalError);
      setRentals([]);
      setDepositByRental({});
    } else {
      const rentalRows = (rentalData || []) as unknown as RentalRow[];
      setRentals(rentalRows);

      const rentalIds = rentalRows.map((rental) => rental.id);

      if (rentalIds.length > 0) {
        const { data: depositRows, error: depositError } = await supabase
          .from("deposit_transactions")
          .select("rental_id, type, amount")
          .in("rental_id", rentalIds);

        if (depositError) {
          console.error(depositError);
          setDepositByRental({});
        } else {
          const balances: Record<string, number> = {};

          (depositRows || []).forEach((row) => {
            const sign = row.type === "received" ? 1 : -1;
            balances[row.rental_id] =
              (balances[row.rental_id] || 0) + sign * Number(row.amount);
          });

          setDepositByRental(balances);
        }
      } else {
        setDepositByRental({});
      }
    }

    setLoading(false);
  }

  async function loadLastWeekClosure() {
    setClosureLoading(true);

    const weekStart = getLastWeekStart();

    const { data, error } = await supabase
      .from("rent_week_closures")
      .select("id, week_start, week_end, closed_by_name, closed_at")
      .eq("week_start", toDateKey(weekStart))
      .maybeSingle();

    if (error) {
      console.error(error);
      setLastWeekClosure(null);
    } else {
      setLastWeekClosure((data as unknown as WeekClosure) || null);
    }

    setClosureLoading(false);
  }

  async function handleGenerateContract(rentalId: string) {
    setContractError("");
    setGeneratingContractId(rentalId);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setContractError("Сессия завершена. Войдите в систему заново.");
        setGeneratingContractId("");
        return;
      }

      const response = await fetch(`/api/rent/${rentalId}/contract`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        setContractError(
          result?.error || "Не удалось сформировать договор."
        );
        setGeneratingContractId("");
        return;
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/);
      const fileName = match ? match[1] : "dogovor.docx";

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setContractError("Не удалось связаться с сервером.");
    } finally {
      setGeneratingContractId("");
    }
  }

  async function handleCloseLastWeek() {
    setClosing(true);
    setCloseError("");

    const weekStart = getLastWeekStart();
    const weekEndExclusive = addDays(weekStart, 7);

    const { data: vehicleData, error: vehicleError } = await supabase
      .from("vehicles")
      .select("id, status, created_at, plate_number, make, model")
      .is("archived_at", null)
      .eq("vehicle_scope", "partner");

    if (vehicleError) {
      console.error(vehicleError);
      setCloseError("Не удалось загрузить данные для закрытия недели.");
      setClosing(false);
      return;
    }

    const closureVehicles = (vehicleData || []) as VehicleForClosure[];
    const vehicleIds = closureVehicles.map((v) => v.id);

    let rentals: RentalForClosure[] = [];
    let adjustments: AdjustmentForClosure[] = [];
    let deposits: DepositForClosure[] = [];

    if (vehicleIds.length > 0) {
      const { data: rentalData, error: rentalError } = await supabase
        .from("rentals")
        .select(
          `
          id,
          vehicle_id,
          weekly_price,
          started_at,
          ended_at,
          status,
          final_amount,
          first_day_half_price,
          driver:drivers ( last_name, first_name )
        `
        )
        .in("vehicle_id", vehicleIds)
        .order("started_at", { ascending: true });

      if (rentalError) {
        console.error(rentalError);
        setCloseError("Не удалось загрузить аренды для закрытия недели.");
        setClosing(false);
        return;
      }

      rentals = (rentalData || []) as unknown as RentalForClosure[];
      const rentalIds = rentals.map((r) => r.id);

      if (rentalIds.length > 0) {
        const [adjustmentResult, depositResult] = await Promise.all([
          supabase
            .from("rental_day_adjustments")
            .select("rental_id, adjustment_date, days")
            .in("rental_id", rentalIds),
          supabase
            .from("deposit_transactions")
            .select("rental_id, type, amount")
            .in("rental_id", rentalIds),
        ]);

        adjustments = adjustmentResult.data || [];
        deposits = depositResult.data || [];
      }
    }

    const balances: Record<string, number> = {};
    deposits.forEach((row) => {
      const sign = row.type === "received" ? 1 : -1;
      balances[row.rental_id] =
        (balances[row.rental_id] || 0) + sign * Number(row.amount);
    });

    const dailyMapByVehicle: Record<string, Map<string, number>> = {};
    const rentalsByVehicle: Record<string, RentalForClosure[]> = {};

    rentals.forEach((rental) => {
      if (!rentalsByVehicle[rental.vehicle_id]) {
        rentalsByVehicle[rental.vehicle_id] = [];
      }
      rentalsByVehicle[rental.vehicle_id].push(rental);

      const rentalAdjustments = adjustments.filter(
        (a) => a.rental_id === rental.id
      );
      const rentalDaily = computeRentalDailyAmounts(rental, rentalAdjustments);

      if (!dailyMapByVehicle[rental.vehicle_id]) {
        dailyMapByVehicle[rental.vehicle_id] = new Map();
      }
      rentalDaily.forEach((amount, dateKey) => {
        const existing = dailyMapByVehicle[rental.vehicle_id].get(dateKey) || 0;
        dailyMapByVehicle[rental.vehicle_id].set(dateKey, existing + amount);
      });
    });

    const dayDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    let grandTotal = 0;

    const rows = closureVehicles.map((vehicle, index) => {
      const dailyMap = dailyMapByVehicle[vehicle.id];
      const rentalsThisWeek = (rentalsByVehicle[vehicle.id] || []).filter(
        (rental) => {
          const start = toDateOnly(rental.started_at);
          const end = rental.ended_at
            ? toDateOnly(rental.ended_at)
            : toDateOnly(new Date());
          return start < weekEndExclusive && end >= weekStart;
        }
      );

      const driverNames = Array.from(
        new Set(
          rentalsThisWeek
            .filter((r) => r.driver)
            .map((r) => `${r.driver!.last_name} ${r.driver!.first_name}`)
        )
      ).join(", ");

      const depositTotal = rentalsThisWeek.reduce(
        (sum, r) => sum + (balances[r.id] || 0),
        0
      );

      const dayAmounts = dayDates.map(
        (date) => dailyMap?.get(toDateKey(date)) || 0
      );
      const rowTotal = dayAmounts.reduce((a, b) => a + b, 0);
      grandTotal += rowTotal;

      const statusLabel =
        rentalsThisWeek.length > 0
          ? "Аренда"
          : { free: "Свободна", service: "СТО", accident: "ДТП" }[
              vehicle.status
            ] || "—";

      return {
        vehicleId: vehicle.id,
        index: index + 1,
        makeModel: `${vehicle.make} ${vehicle.model}`,
        plateNumber: vehicle.plate_number,
        driverNames: driverNames || "—",
        statusLabel,
        depositTotal,
        dayAmounts,
        rowTotal,
      };
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    let closedByName: string | null = null;

    if (user) {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();
      closedByName = profileData?.full_name || null;
    }

    const { error: insertError } = await supabase
      .from("rent_week_closures")
      .insert({
        week_start: toDateKey(weekStart),
        week_end: toDateKey(addDays(weekStart, 6)),
        closed_by: user?.id ?? null,
        closed_by_name: closedByName,
        grand_total: grandTotal,
        snapshot: { rows },
      });

    if (insertError) {
      console.error(insertError);
      setCloseError("Не удалось закрыть неделю: " + insertError.message);
      setClosing(false);
      return;
    }

    setConfirmClose(false);
    setClosing(false);
    await loadLastWeekClosure();
  }

  const totalCount = vehicles.length;

  const freeCount = vehicles.filter(
    (vehicle) => vehicle.status === "free"
  ).length;

  const rentedCount = vehicles.filter(
    (vehicle) => vehicle.status === "working"
  ).length;

  const serviceCount = vehicles.filter(
    (vehicle) => vehicle.status === "service"
  ).length;

  const accidentCount = vehicles.filter(
    (vehicle) => vehicle.status === "accident"
  ).length;

  if (loading) {
    return <main style={loadingStyle}>Загрузка...</main>;
  }

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <div style={headerStyle}>
          <div>
            <div style={systemTitleStyle}>MEDUZA SYSTEM</div>

            <h1 style={titleStyle}>Аренда</h1>
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

        {!closureLoading && !lastWeekClosure && isMonday() && (
          <div style={closeSectionStyle}>
            {!confirmClose ? (
              <button
                type="button"
                onClick={() => setConfirmClose(true)}
                style={closeButtonStyle}
              >
                Завершить неделю ({formatWeekRange(getLastWeekStart())})
              </button>
            ) : (
              <div style={confirmBoxStyle}>
                <div style={confirmTextStyle}>
                  Проверь, что все данные за прошлую неделю (
                  {formatWeekRange(getLastWeekStart())}) внесены верно —
                  списания дней, завершения аренд, депозиты. После
                  закрытия недели изменить или удалить их будет нельзя,
                  а неделя попадёт в «Отчёт по аренде» для истории.
                  Продолжить?
                </div>

                {closeError && <div style={rowErrorStyle}>{closeError}</div>}

                <div style={confirmButtonsStyle}>
                  <button
                    type="button"
                    onClick={() => setConfirmClose(false)}
                    style={secondaryButtonStyle}
                  >
                    Отмена
                  </button>

                  <button
                    type="button"
                    disabled={closing}
                    onClick={handleCloseLastWeek}
                    style={closeButtonStyle}
                  >
                    {closing ? "Закрываем..." : "Да, закрыть неделю"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div style={summaryGridStyle}>
          <SummaryCard title="Всего автомобилей" value={totalCount} />

          <SummaryCard title="Свободные" value={freeCount} />

          <SummaryCard title="В аренде" value={rentedCount} />

          <SummaryCard title="СТО" value={serviceCount} />

          <SummaryCard title="ДТП" value={accidentCount} />
        </div>

        <section style={sectionStyle}>
          <div style={sectionHeaderStyle}>
            <div>
              <h2 style={sectionTitleStyle}>Текущие аренды</h2>

              <div style={weekLabelStyle}>
                Неделя: {getCurrentWeekLabel()}
              </div>
            </div>

            <button
              type="button"
              onClick={() => router.push("/rent/new")}
              style={primaryButtonStyle}
            >
              + Новая аренда
            </button>
          </div>

          {contractError && (
            <div style={contractErrorStyle}>{contractError}</div>
          )}

          <div style={tableCardStyle}>
            <div style={tableScrollStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thNumStyle}>№</th>
                    <th style={thStyle}>Гос. номер</th>
                    <th style={thStyle}>Автомобиль</th>
                    <th style={thStyle}>Водитель</th>
                    <th style={thStyle}>Цена/нед.</th>
                    <th style={thStyle}>Депозит</th>
                    <th style={thStyle}></th>
                  </tr>
                </thead>

                <tbody>
                  {rentals.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={emptyTableStyle}>
                        Активных аренд пока нет
                      </td>
                    </tr>
                  ) : (
                    rentals.map((rental, index) => (
                      <tr key={rental.id}>
                        <td style={tdNumStyle}>{index + 1}</td>

                        <td style={tdStyle}>
                          {rental.vehicle?.plate_number || "—"}
                        </td>

                        <td style={tdStyle}>
                          {rental.vehicle
                            ? `${rental.vehicle.make} ${rental.vehicle.model}`
                            : "—"}
                        </td>

                        <td style={tdStyle}>
                          {rental.driver
                            ? `${rental.driver.last_name} ${rental.driver.first_name}`
                            : "—"}
                        </td>

                        <td style={tdStyle}>
                          {formatMoney(rental.weekly_price)}
                        </td>

                        <td style={tdStyle}>
                          {depositByRental[rental.id]
                            ? formatMoney(depositByRental[rental.id])
                            : "—"}
                        </td>

                        <td style={tdActionStyle}>
                          <div style={actionGroupStyle}>
                            <button
                              type="button"
                              onClick={() =>
                                router.push(`/rent/${rental.id}/adjust`)
                              }
                              style={adjustButtonStyle}
                            >
                              Списать дни
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                router.push(`/rent/${rental.id}/end`)
                              }
                              style={endButtonStyle}
                            >
                              Завершить аренду
                            </button>

                            <button
                              type="button"
                              onClick={() => handleGenerateContract(rental.id)}
                              disabled={generatingContractId === rental.id}
                              style={contractButtonStyle}
                            >
                              {generatingContractId === rental.id
                                ? "Формирую..."
                                : "Договор"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function SummaryCard({ title, value }: { title: string; value: number }) {
  return (
    <div style={summaryCardStyle}>
      <div style={summaryLabelStyle}>{title}</div>

      <div style={summaryValueStyle}>{value}</div>
    </div>
  );
}

function formatMoney(amount: number) {
  return `${amount.toLocaleString("pl-PL")} zł`;
}

function toDateOnly(value: string | Date): Date {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function getMonday(date: Date): Date {
  const d = toDateOnly(date);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return d;
}

function formatFullDate(date: Date) {
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatWeekRange(weekStart: Date) {
  const weekEnd = addDays(weekStart, 6);
  return `${formatFullDate(weekStart)} – ${formatFullDate(weekEnd)}`;
}

function getCurrentWeekLabel() {
  return formatWeekRange(getMonday(new Date()));
}

function getLastWeekStart() {
  return addDays(getMonday(new Date()), -7);
}

// Завершать неделю можно только по понедельникам — как только наступает
// новая календарная неделя, становится доступно закрытие предыдущей.
function isMonday() {
  return new Date().getDay() === 1;
}

// Считает сумму по дням для одной аренды — та же логика, что и в
// отчёте по аренде (/rent/report), скопирована сюда, чтобы страница
// "Аренда" могла сама закрыть прошлую неделю без похода в отчёт.
function computeRentalDailyAmounts(
  rental: RentalForClosure,
  adjustments: AdjustmentForClosure[]
): Map<string, number> {
  const dailyRate = rental.weekly_price / 7;
  const startDate = toDateOnly(rental.started_at);
  const today = toDateOnly(new Date());
  const isCompleted = rental.status === "completed" && rental.ended_at;
  const lastDay = isCompleted
    ? toDateOnly(rental.ended_at as string)
    : startDate > today
    ? startDate
    : today;

  const map = new Map<string, number>();

  if (lastDay < startDate) {
    return map;
  }

  const lastDayKey = toDateKey(lastDay);
  const cursor = new Date(startDate);
  let index = 0;

  while (toDateKey(cursor) <= lastDayKey) {
    const dateKey = toDateKey(cursor);
    const isLastDayOfCompleted = isCompleted && dateKey === lastDayKey;

    if (!isLastDayOfCompleted) {
      const adjustment = adjustments.find(
        (a) =>
          a.rental_id === rental.id &&
          toDateKey(toDateOnly(a.adjustment_date)) === dateKey
      );

      let amount = dailyRate;

      if (adjustment) {
        amount = dailyRate * Math.max(1 - adjustment.days, 0);
      } else if (index === 0 && rental.first_day_half_price) {
        amount = dailyRate * 0.5;
      }

      map.set(dateKey, amount);
    }

    index += 1;
    cursor.setDate(cursor.getDate() + 1);
  }

  if (isCompleted) {
    const sumOtherDays = Array.from(map.values()).reduce((a, b) => a + b, 0);
    const residual = Math.max((rental.final_amount ?? 0) - sumOtherDays, 0);
    map.set(lastDayKey, residual);
  }

  return map;
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

const summaryGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
  gap: "16px",
  marginBottom: "30px",
};

const summaryCardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  padding: "18px 18px",
};

const summaryLabelStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#6b7280",
  marginBottom: "8px",
};

const summaryValueStyle: React.CSSProperties = {
  fontSize: "26px",
  lineHeight: 1,
  fontWeight: 700,
  color: "#111827",
};

const sectionStyle: React.CSSProperties = {
  marginBottom: "32px",
};

const sectionHeaderStyle: React.CSSProperties = {
  minHeight: "42px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "20px",
  marginBottom: "12px",
};

const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "20px",
  fontWeight: 700,
};

const weekLabelStyle: React.CSSProperties = {
  marginTop: "4px",
  fontSize: "13px",
  color: "#6b7280",
};

const closedBannerStyle: React.CSSProperties = {
  padding: "12px 16px",
  background: "#ecfdf5",
  border: "1px solid #a7f3d0",
  color: "#065f46",
  borderRadius: "10px",
  fontSize: "13px",
  marginBottom: "24px",
};

const closeSectionStyle: React.CSSProperties = {
  marginBottom: "24px",
};

const closeButtonStyle: React.CSSProperties = {
  height: "42px",
  padding: "0 16px",
  border: "none",
  borderRadius: "8px",
  background: "#16a34a",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
};

const confirmBoxStyle: React.CSSProperties = {
  background: "#fefce8",
  border: "1px solid #fde68a",
  borderRadius: "10px",
  padding: "16px",
};

const confirmTextStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#78350f",
  marginBottom: "12px",
};

const confirmButtonsStyle: React.CSSProperties = {
  display: "flex",
  gap: "10px",
};

const rowErrorStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#dc2626",
  marginBottom: "10px",
};

const contractErrorStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#991b1b",
  background: "#fee2e2",
  border: "1px solid #fecaca",
  borderRadius: "8px",
  padding: "10px 14px",
  marginBottom: "14px",
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

const thNumStyle: React.CSSProperties = {
  padding: "13px 16px",
  textAlign: "left",
  background: "#f9fafb",
  borderBottom: "1px solid #e5e7eb",
  fontSize: "12px",
  fontWeight: 600,
  color: "#6b7280",
  whiteSpace: "nowrap",
  width: "1%",
};

const tdNumStyle: React.CSSProperties = {
  padding: "13px 16px",
  textAlign: "left",
  borderBottom: "1px solid #f0f1f3",
  fontSize: "14px",
  color: "#9ca3af",
  whiteSpace: "nowrap",
  width: "1%",
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

const emptyTableStyle: React.CSSProperties = {
  padding: "36px 16px",
  textAlign: "center",
  fontSize: "14px",
  color: "#9ca3af",
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

const actionGroupStyle: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  justifyContent: "flex-end",
};

const adjustButtonStyle: React.CSSProperties = {
  height: "34px",
  padding: "0 14px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  background: "#ffffff",
  color: "#6b7280",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
};

const endButtonStyle: React.CSSProperties = {
  height: "34px",
  padding: "0 14px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  background: "#ffffff",
  color: "#111827",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
};

const contractButtonStyle: React.CSSProperties = {
  height: "34px",
  padding: "0 14px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  background: "#ffffff",
  color: "#6b7280",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
};
