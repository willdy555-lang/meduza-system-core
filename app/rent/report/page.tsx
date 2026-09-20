"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

type ReportRow = {
  vehicleId: string;
  index: number;
  makeModel: string;
  plateNumber: string;
  driverNames: string;
  statusLabel: string;
  depositTotal: number;
  dayAmounts: number[];
  rowTotal: number;
};

type WeekClosure = {
  id: string;
  week_start: string;
  week_end: string;
  closed_by_name: string | null;
  closed_at: string;
  grand_total: number;
  snapshot: { rows: ReportRow[] };
};

const DAY_LABELS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatMoney(amount: number) {
  return `${amount.toLocaleString("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} zł`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFullDate(date: Date) {
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatWeekLabel(weekStartValue: string): string {
  const weekStart = parseDateOnly(weekStartValue);
  const weekEnd = addDays(weekStart, 6);
  return `${formatFullDate(weekStart)} – ${formatFullDate(weekEnd)}`;
}

function getDayDates(weekStartValue: string): Date[] {
  const weekStart = parseDateOnly(weekStartValue);
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export default function RentReportPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [accessChecked, setAccessChecked] = useState(false);
  const [closures, setClosures] = useState<WeekClosure[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    if (!["director", "administrator"].includes(profile.role)) {
      router.replace("/partner");
      return;
    }

    setAccessChecked(true);

    const { data, error } = await supabase
      .from("rent_week_closures")
      .select(
        "id, week_start, week_end, closed_by_name, closed_at, grand_total, snapshot"
      )
      .order("week_start", { ascending: true });

    if (error) {
      console.error(error);
      setClosures([]);
    } else {
      const list = (data || []) as unknown as WeekClosure[];
      setClosures(list);
      setSelectedIndex(list.length > 0 ? list.length - 1 : 0);
    }

    setLoading(false);
  }

  if (loading || !accessChecked) {
    return <main style={loadingStyle}>Загрузка...</main>;
  }

  const hasClosures = closures.length > 0;
  const currentClosure = hasClosures ? closures[selectedIndex] : null;
  const isAtFirst = selectedIndex <= 0;
  const isAtLast = selectedIndex >= closures.length - 1;
  const dayDates = currentClosure ? getDayDates(currentClosure.week_start) : [];
  const rows = currentClosure ? currentClosure.snapshot.rows : [];
  const grandTotal = currentClosure ? currentClosure.grand_total : 0;

  return (
    <main style={pageStyle}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .report-scroll { overflow: visible !important; }
          .report-table {
            min-width: 0 !important;
            width: 100% !important;
            font-size: 10px !important;
          }
          .report-table th, .report-table td {
            padding: 4px 6px !important;
            white-space: normal !important;
          }
          @page { size: landscape; margin: 10mm; }
        }
      `}</style>

      <div style={containerStyle}>
        <div style={headerStyle} className="no-print">
          <div>
            <div style={systemTitleStyle}>MEDUZA SYSTEM</div>
            <h1 style={titleStyle}>Отчёт по аренде</h1>
            <div style={subtitleStyle}>
              История закрытых недель по автопарку
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

            {hasClosures && (
              <button
                type="button"
                onClick={() => window.print()}
                style={primaryButtonStyle}
              >
                Распечатать отчёт
              </button>
            )}
          </div>
        </div>

        {!hasClosures ? (
          <div style={emptyStateStyle}>
            Закрытых недель пока нет. Неделя появится здесь автоматически,
            как только её закроют в разделе «Аренда» (кнопка «Завершить
            неделю» доступна там по понедельникам).
          </div>
        ) : (
          <>
            <div style={weekBarStyle} className="no-print">
              <button
                type="button"
                onClick={() => setSelectedIndex((i) => i - 1)}
                disabled={isAtFirst}
                style={{
                  ...weekNavButtonStyle,
                  opacity: isAtFirst ? 0.4 : 1,
                  cursor: isAtFirst ? "not-allowed" : "pointer",
                }}
              >
                ←
              </button>

              <div style={weekLabelStyle}>
                Неделя:{" "}
                <strong>
                  {currentClosure ? formatWeekLabel(currentClosure.week_start) : ""}
                </strong>
              </div>

              <button
                type="button"
                onClick={() => setSelectedIndex((i) => i + 1)}
                disabled={isAtLast}
                style={{
                  ...weekNavButtonStyle,
                  opacity: isAtLast ? 0.4 : 1,
                  cursor: isAtLast ? "not-allowed" : "pointer",
                }}
              >
                →
              </button>

              <div style={weekJumpStyle}>
                <label style={weekJumpLabelStyle}>Выбрать неделю:</label>
                <select
                  value={selectedIndex}
                  onChange={(e) => setSelectedIndex(Number(e.target.value))}
                  style={weekSelectStyle}
                >
                  {closures.map((c, i) => (
                    <option key={c.id} value={i}>
                      {formatWeekLabel(c.week_start)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={tableCardStyle}>
              <div style={tableScrollStyle} className="report-scroll">
                <table style={tableStyle} className="report-table">
                  <thead>
                    <tr>
                      <th style={thNumStyle}>№</th>
                      <th style={thStyle}>Марка / модель</th>
                      <th style={thStyle}>Номер авто</th>
                      <th style={thStyle}>Водитель</th>
                      <th style={thStyle}>Статус</th>
                      <th style={thStyle}>Депозит</th>
                      {dayDates.map((date, i) => (
                        <th style={thDayStyle} key={i}>
                          {DAY_LABELS[i]}{" "}
                          {date.toLocaleDateString("ru-RU", {
                            day: "2-digit",
                            month: "2-digit",
                          })}
                        </th>
                      ))}
                      <th style={thTotalStyle}>Итого</th>
                    </tr>
                  </thead>

                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={13} style={emptyTableStyle}>
                          Автомобилей пока нет
                        </td>
                      </tr>
                    ) : (
                      rows.map((row) => (
                        <tr key={row.vehicleId}>
                          <td style={tdNumStyle}>{row.index}</td>
                          <td style={tdStyle}>{row.makeModel}</td>
                          <td style={tdStyle}>{row.plateNumber}</td>
                          <td style={tdStyle}>{row.driverNames}</td>
                          <td style={tdStyle}>{row.statusLabel}</td>
                          <td style={tdStyle}>
                            {row.depositTotal > 0
                              ? formatMoney(row.depositTotal)
                              : "—"}
                          </td>

                          {row.dayAmounts.map((amount, i) => (
                            <td style={tdDayStyle} key={i}>
                              {amount > 0
                                ? amount.toLocaleString("pl-PL", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })
                                : "0,00"}
                            </td>
                          ))}

                          <td style={tdTotalStyle}>
                            {formatMoney(row.rowTotal)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>

                  {rows.length > 0 && (
                    <tfoot>
                      <tr>
                        <td colSpan={13} style={tfootLabelStyle}>
                          Итого по автопарку за неделю
                        </td>
                        <td style={tfootTotalStyle}>
                          {formatMoney(grandTotal)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            <div style={noteStyle} className="no-print">
              Здесь показываются только закрытые недели — цифры
              зафиксированы на момент закрытия и не меняются, даже если
              потом задним числом изменят данные аренды за эти даты.
            </div>
          </>
        )}
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
  maxWidth: "1600px",
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

const emptyStateStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  padding: "36px 24px",
  textAlign: "center",
  fontSize: "14px",
  color: "#6b7280",
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

const weekSelectStyle: React.CSSProperties = {
  height: "34px",
  padding: "0 10px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  fontSize: "13px",
  background: "#ffffff",
};

const closedBannerStyle: React.CSSProperties = {
  padding: "12px 16px",
  background: "#ecfdf5",
  border: "1px solid #a7f3d0",
  color: "#065f46",
  borderRadius: "10px",
  fontSize: "13px",
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
  minWidth: "1300px",
};

const thStyle: React.CSSProperties = {
  padding: "6px 8px",
  textAlign: "left",
  background: "#f9fafb",
  borderBottom: "1px solid #e5e7eb",
  fontSize: "11px",
  fontWeight: 600,
  color: "#6b7280",
  whiteSpace: "nowrap",
};

const thNumStyle: React.CSSProperties = {
  ...thStyle,
  width: "1%",
};

const thDayStyle: React.CSSProperties = {
  ...thStyle,
  textAlign: "right",
};

const thTotalStyle: React.CSSProperties = {
  ...thStyle,
  textAlign: "right",
};

const tdStyle: React.CSSProperties = {
  padding: "6px 8px",
  textAlign: "left",
  borderBottom: "1px solid #f0f1f3",
  fontSize: "12px",
  whiteSpace: "nowrap",
};

const tdNumStyle: React.CSSProperties = {
  ...tdStyle,
  color: "#9ca3af",
};

const tdDayStyle: React.CSSProperties = {
  ...tdStyle,
  textAlign: "right",
};

const tdTotalStyle: React.CSSProperties = {
  ...tdStyle,
  textAlign: "right",
  fontWeight: 700,
};

const tfootLabelStyle: React.CSSProperties = {
  padding: "6px 8px",
  textAlign: "right",
  fontSize: "12px",
  fontWeight: 700,
  borderTop: "2px solid #111827",
};

const tfootTotalStyle: React.CSSProperties = {
  padding: "6px 8px",
  textAlign: "right",
  fontSize: "13px",
  fontWeight: 700,
  borderTop: "2px solid #111827",
  color: "#16a34a",
};

const emptyTableStyle: React.CSSProperties = {
  padding: "36px 16px",
  textAlign: "center",
  fontSize: "14px",
  color: "#9ca3af",
};

const noteStyle: React.CSSProperties = {
  marginTop: "14px",
  fontSize: "13px",
  color: "#9ca3af",
};
