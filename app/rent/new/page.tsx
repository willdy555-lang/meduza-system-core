"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  production_year: number | null;
  current_mileage: number | null;
  status: string;
};

type Driver = {
  id: string;
  last_name: string;
  first_name: string;
};

export default function NewRentPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);

  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [selectedDriverId, setSelectedDriverId] = useState("");

  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");

  const [weeklyPrice, setWeeklyPrice] = useState("");
  const [deposit, setDeposit] = useState("");
  const [firstDayHalfPrice, setFirstDayHalfPrice] = useState(false);

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

    const { data: vehicleData, error: vehicleError } = await supabase
      .from("vehicles")
      .select(`
        id,
        plate_number,
        make,
        model,
        production_year,
        current_mileage,
        status
      `)
      .eq("status", "free")
      .is("archived_at", null)
      .order("plate_number", { ascending: true });

    if (vehicleError) {
      console.error(vehicleError);
      setVehicles([]);
    } else {
      setVehicles(vehicleData || []);
    }

    const { data: driverData, error: driverError } = await supabase
      .from("drivers")
      .select(`
        id,
        last_name,
        first_name
      `)
      .is("archived_at", null)
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true });

    if (driverError) {
      console.error(driverError);
      setDrivers([]);
    } else {
      setDrivers(driverData || []);
    }

    setLoading(false);
  }

  const canContinue =
    selectedVehicleId.length > 0 &&
    selectedDriverId.length > 0 &&
    startDate.trim().length > 0 &&
    startTime.trim().length > 0 &&
    weeklyPrice.trim().length > 0 &&
    deposit.trim().length > 0;

  function handlePriceChange(value: string) {
    setWeeklyPrice(value.replace(/[^0-9.,]/g, ""));
  }

  function handleDepositChange(value: string) {
    setDeposit(value.replace(/[^0-9.,]/g, ""));
  }

  function parseAmount(value: string) {
    const normalized = value.trim().replace(",", ".");
    const amount = Number(normalized);
    return Number.isFinite(amount) ? amount : 0;
  }

  async function handleOpenRental() {
    if (!canContinue || submitting) return;

    setSubmitting(true);
    setErrorMessage("");

    // Повторная проверка прямо перед созданием — на случай, если машину
    // за это время уже забрали в другую аренду.
    const { data: freshVehicle, error: freshVehicleError } = await supabase
      .from("vehicles")
      .select("id, status")
      .eq("id", selectedVehicleId)
      .single();

    if (freshVehicleError || !freshVehicle || freshVehicle.status !== "free") {
      setErrorMessage(
        "Этот автомобиль больше не свободен. Список обновлён — выберите другой."
      );
      setSubmitting(false);
      await loadPage();
      setSelectedVehicleId("");
      return;
    }

    const startedAtIso = new Date(
      `${startDate}T${startTime}`
    ).toISOString();

    const { data: rental, error: rentalError } = await supabase
      .from("rentals")
      .insert({
        vehicle_id: selectedVehicleId,
        driver_id: selectedDriverId,
        started_at: startedAtIso,
        weekly_price: parseAmount(weeklyPrice),
        status: "active",
        first_day_half_price: firstDayHalfPrice,
      })
      .select("id")
      .single();

    if (rentalError || !rental) {
      console.error(rentalError);
      setErrorMessage(
        "Не удалось открыть аренду. Возможно, автомобиль или водитель уже заняты. Попробуйте ещё раз."
      );
      setSubmitting(false);
      await loadPage();
      return;
    }

    const depositAmount = parseAmount(deposit);

    if (depositAmount > 0) {
      const { error: depositError } = await supabase
        .from("deposit_transactions")
        .insert({
          rental_id: rental.id,
          type: "received",
          amount: depositAmount,
        });

      if (depositError) {
        console.error(depositError);
      }
    }

    const { error: vehicleUpdateError } = await supabase
      .from("vehicles")
      .update({ status: "working" })
      .eq("id", selectedVehicleId);

    if (vehicleUpdateError) {
      console.error(vehicleUpdateError);
    }

    const driver = drivers.find((d) => d.id === selectedDriverId);
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();

    await supabase.from("vehicle_events").insert({
      vehicle_id: selectedVehicleId,
      event_type: "rental_started",
      title: "Открыта аренда",
      description: `Водитель: ${
        driver ? `${driver.last_name} ${driver.first_name}` : "—"
      }; цена/нед.: ${parseAmount(weeklyPrice).toLocaleString(
        "pl-PL"
      )} zł; депозит: ${depositAmount.toLocaleString("pl-PL")} zł`,
      actor_id: currentUser?.id ?? null,
      payload: { rental_id: rental.id, driver_id: selectedDriverId },
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

            <h1 style={titleStyle}>Новая аренда</h1>
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
          <EntitySelector<Vehicle>
            label="Автомобиль *"
            placeholder="Выберите автомобиль"
            searchPlaceholder="Поиск по номеру, марке, модели"
            items={vehicles}
            selectedId={selectedVehicleId}
            onSelect={setSelectedVehicleId}
            getId={(vehicle) => vehicle.id}
            getSearchText={(vehicle) =>
              [
                vehicle.plate_number,
                vehicle.make,
                vehicle.model,
                vehicle.production_year?.toString(),
              ]
                .filter(Boolean)
                .join(" ")
            }
            renderSelected={(vehicle) =>
              `${vehicle.plate_number} — ${vehicle.make} ${vehicle.model}`
            }
            renderRow={(vehicle) => (
              <div style={listMainStyle}>
                <strong>{vehicle.plate_number}</strong>

                <span>
                  {vehicle.make} {vehicle.model}
                </span>

                <span style={listMetaStyle}>
                  {vehicle.production_year || "—"} ·{" "}
                  {formatMileage(vehicle.current_mileage)}
                </span>
              </div>
            )}
            emptyText="Свободных автомобилей не найдено"
          />

          <EntitySelector<Driver>
            label="Водитель *"
            placeholder="Выберите водителя"
            searchPlaceholder="Поиск по фамилии или имени"
            items={drivers}
            selectedId={selectedDriverId}
            onSelect={setSelectedDriverId}
            getId={(driver) => driver.id}
            getSearchText={(driver) =>
              `${driver.last_name} ${driver.first_name}`
            }
            renderSelected={(driver) =>
              `${driver.last_name} ${driver.first_name}`
            }
            renderRow={(driver) => (
              <div style={listMainStyle}>
                <strong>{driver.last_name}</strong>

                <span>{driver.first_name}</span>
              </div>
            )}
            emptyText="Водители не найдены"
          />

          <div style={compactRowStyle}>
            <div style={compactFieldStyle}>
              <label style={labelStyle}>Дата начала аренды *</label>

              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={compactInputStyle}
              />
            </div>

            <div style={compactFieldStyle}>
              <label style={labelStyle}>Время начала аренды *</label>

              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                style={compactInputStyle}
              />
            </div>

            <div style={compactFieldStyle}>
              <label style={labelStyle}>Цена аренды / нед. *</label>

              <div style={moneyFieldStyle}>
                <input
                  type="text"
                  inputMode="decimal"
                  value={weeklyPrice}
                  onChange={(e) => handlePriceChange(e.target.value)}
                  style={moneyInputStyle}
                />

                <div style={currencyStyle}>zł</div>
              </div>
            </div>

            <div style={compactFieldStyle}>
              <label style={labelStyle}>Депозит *</label>

              <div style={moneyFieldStyle}>
                <input
                  type="text"
                  inputMode="decimal"
                  value={deposit}
                  onChange={(e) => handleDepositChange(e.target.value)}
                  style={moneyInputStyle}
                />

                <div style={currencyStyle}>zł</div>
              </div>
            </div>
          </div>

          <label style={checkboxRowStyle}>
            <input
              type="checkbox"
              checked={firstDayHalfPrice}
              onChange={(e) => setFirstDayHalfPrice(e.target.checked)}
              style={checkboxInputStyle}
            />
            Первый день — 50% (скидка на день начала аренды)
          </label>

          {errorMessage && (
            <div style={errorBoxStyle}>{errorMessage}</div>
          )}

          <div style={footerStyle}>
            <button
              type="button"
              disabled={!canContinue || submitting}
              onClick={handleOpenRental}
              style={{
                ...saveButtonStyle,
                background: canContinue && !submitting ? "#2563eb" : "#9ca3af",
                cursor:
                  canContinue && !submitting ? "pointer" : "not-allowed",
              }}
            >
              {submitting ? "Открываем..." : "Открыть аренду"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

function EntitySelector<T,>({
  label,
  placeholder,
  searchPlaceholder,
  items,
  selectedId,
  onSelect,
  getId,
  getSearchText,
  renderSelected,
  renderRow,
  emptyText,
}: {
  label: string;
  placeholder: string;
  searchPlaceholder: string;
  items: T[];
  selectedId: string;
  onSelect: (id: string) => void;
  getId: (item: T) => string;
  getSearchText: (item: T) => string;
  renderSelected: (item: T) => React.ReactNode;
  renderRow: (item: T) => React.ReactNode;
  emptyText: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
        setSearch("");
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  const selectedItem = items.find((item) => getId(item) === selectedId);

  const filteredItems = useMemo(() => {
    const text = search.trim().toLowerCase();

    if (!text) return items;

    return items.filter((item) =>
      getSearchText(item).toLowerCase().includes(text)
    );
  }, [items, search, getSearchText]);

  function handleSelect(id: string) {
    onSelect(id);
    setOpen(false);
    setSearch("");
  }

  return (
    <div style={selectorWrapStyle} ref={containerRef}>
      <div style={sectionTitleStyle}>{label}</div>

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        style={{
          ...selectorFieldStyle,
          ...(open ? selectorFieldOpenStyle : {}),
        }}
      >
        {selectedItem ? (
          <span style={selectorValueStyle}>
            {renderSelected(selectedItem)}
          </span>
        ) : (
          <span style={selectorPlaceholderStyle}>{placeholder}</span>
        )}
      </button>

      {open && (
        <div style={dropdownPanelStyle}>
          <input
            type="text"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            style={dropdownSearchStyle}
          />

          <div style={dropdownListStyle}>
            {filteredItems.length === 0 ? (
              <div style={emptyStyle}>{emptyText}</div>
            ) : (
              filteredItems.map((item) => {
                const id = getId(item);
                const selected = id === selectedId;

                return (
                  <div
                    key={id}
                    onClick={() => handleSelect(id)}
                    style={{
                      ...dropdownRowStyle,
                      ...(selected ? selectedListItemStyle : {}),
                    }}
                  >
                    {renderRow(item)}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatMileage(mileage: number | null) {
  if (mileage === null || mileage === undefined) {
    return "—";
  }

  return `${mileage.toLocaleString("pl-PL")} км`;
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

const sectionTitleStyle: React.CSSProperties = {
  marginBottom: "8px",
  fontSize: "14px",
  fontWeight: 700,
};

const selectorWrapStyle: React.CSSProperties = {
  position: "relative",
  marginBottom: "20px",
};

const selectorFieldStyle: React.CSSProperties = {
  width: "100%",
  height: "44px",
  boxSizing: "border-box",
  padding: "0 14px",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "#d1d5db",
  borderRadius: "8px",
  background: "#ffffff",
  fontSize: "14px",
  textAlign: "left",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
};

const selectorFieldOpenStyle: React.CSSProperties = {
  borderColor: "#2563eb",
};

const selectorPlaceholderStyle: React.CSSProperties = {
  color: "#9ca3af",
};

const selectorValueStyle: React.CSSProperties = {
  color: "#111827",
  fontWeight: 600,
};

const dropdownPanelStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 6px)",
  left: 0,
  right: 0,
  zIndex: 10,
  background: "#ffffff",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  boxShadow: "0 8px 20px rgba(0, 0, 0, 0.08)",
  padding: "10px",
};

const dropdownSearchStyle: React.CSSProperties = {
  width: "100%",
  height: "38px",
  boxSizing: "border-box",
  padding: "0 10px",
  border: "1px solid #d1d5db",
  borderRadius: "6px",
  fontSize: "14px",
  outline: "none",
  marginBottom: "8px",
};

const dropdownListStyle: React.CSSProperties = {
  maxHeight: "220px",
  overflowY: "auto",
  border: "1px solid #f0f1f3",
  borderRadius: "6px",
};

const dropdownRowStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #f0f1f3",
  cursor: "pointer",
  fontSize: "14px",
};

const selectedListItemStyle: React.CSSProperties = {
  background: "#eff6ff",
};

const listMainStyle: React.CSSProperties = {
  display: "flex",
  gap: "12px",
  alignItems: "center",
  flexWrap: "wrap",
};

const listMetaStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#6b7280",
};

const emptyStyle: React.CSSProperties = {
  padding: "18px 12px",
  textAlign: "center",
  color: "#9ca3af",
  fontSize: "14px",
};

const compactRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "16px",
  marginTop: "6px",
};

const compactFieldStyle: React.CSSProperties = {
  width: "170px",
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

const moneyFieldStyle: React.CSSProperties = {
  display: "flex",
};

const moneyInputStyle: React.CSSProperties = {
  width: "100%",
  height: "42px",
  boxSizing: "border-box",
  padding: "0 12px",
  border: "1px solid #d1d5db",
  borderRight: "none",
  borderRadius: "8px 0 0 8px",
  fontSize: "14px",
  outline: "none",
};

const currencyStyle: React.CSSProperties = {
  width: "44px",
  height: "42px",
  border: "1px solid #d1d5db",
  borderRadius: "0 8px 8px 0",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#f9fafb",
  color: "#6b7280",
  fontSize: "14px",
  flexShrink: 0,
};

const checkboxRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  fontSize: "14px",
  color: "#111827",
  marginTop: "18px",
  cursor: "pointer",
};

const checkboxInputStyle: React.CSSProperties = {
  width: "16px",
  height: "16px",
  cursor: "pointer",
};

const errorBoxStyle: React.CSSProperties = {
  marginTop: "20px",
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
