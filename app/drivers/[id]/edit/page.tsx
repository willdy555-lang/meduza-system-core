"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

type Driver = {
  id: string;
  last_name: string;
  first_name: string;
  passport_number: string | null;
  pesel: string | null;
  driving_license_number: string | null;
  residence_card_number: string | null;
  postal_code: string | null;
  city: string | null;
  street: string | null;
  house_number: string | null;
  apartment_number: string | null;
  phone: string | null;
  email: string | null;
};

export default function EditDriverPage() {
  const router = useRouter();
  const params = useParams();
  const driverId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState("");

  const [original, setOriginal] = useState<Driver | null>(null);

  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");

  const [passportNumber, setPassportNumber] = useState("");
  const [drivingLicenseNumber, setDrivingLicenseNumber] = useState("");

  const [pesel, setPesel] = useState("");
  const [residenceCardNumber, setResidenceCardNumber] = useState("");

  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [street, setStreet] = useState("");
  const [houseNumber, setHouseNumber] = useState("");
  const [apartmentNumber, setApartmentNumber] = useState("");

  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const [role, setRole] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletingDriver, setDeletingDriver] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    loadPage();
  }, [driverId]);

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

    const { data, error } = await supabase
      .from("drivers")
      .select(`
        id,
        last_name,
        first_name,
        passport_number,
        pesel,
        driving_license_number,
        residence_card_number,
        postal_code,
        city,
        street,
        house_number,
        apartment_number,
        phone,
        email
      `)
      .eq("id", driverId)
      .is("archived_at", null)
      .single();

    if (error || !data) {
      console.error(error);
      setErrorText("Не удалось загрузить данные водителя.");
      setLoading(false);
      return;
    }

    setOriginal(data);

    setLastName(data.last_name ?? "");
    setFirstName(data.first_name ?? "");
    setPassportNumber(data.passport_number ?? "");
    setPesel(data.pesel ?? "");
    setDrivingLicenseNumber(data.driving_license_number ?? "");
    setResidenceCardNumber(data.residence_card_number ?? "");

    setPostalCode(data.postal_code ?? "");
    setCity(data.city ?? "");
    setStreet(data.street ?? "");
    setHouseNumber(data.house_number ?? "");
    setApartmentNumber(data.apartment_number ?? "");

    setPhone(data.phone ?? "");
    setEmail(data.email ?? "");

    setLoading(false);
  }

  const isValid = useMemo(() => {
    // Раньше здесь требовались вообще все поля, из-за чего кнопку
    // "Сохранить изменения" было невозможно нажать для водителей,
    // у которых часть данных (например email или PESEL) не была
    // заполнена ранее. Для редактирования достаточно фамилии и имени —
    // остальные поля можно дозаполнить позже.
    return lastName.trim().length > 0 && firstName.trim().length > 0;
  }, [lastName, firstName]);

  const hasChanges = useMemo(() => {
    if (!original) return false;

    return (
      lastName.trim() !== (original.last_name ?? "") ||
      firstName.trim() !== (original.first_name ?? "") ||
      passportNumber.trim() !== (original.passport_number ?? "") ||
      drivingLicenseNumber.trim() !==
        (original.driving_license_number ?? "") ||
      pesel.trim() !== (original.pesel ?? "") ||
      residenceCardNumber.trim() !==
        (original.residence_card_number ?? "") ||
      postalCode.trim() !== (original.postal_code ?? "") ||
      city.trim() !== (original.city ?? "") ||
      street.trim() !== (original.street ?? "") ||
      houseNumber.trim() !== (original.house_number ?? "") ||
      apartmentNumber.trim() !==
        (original.apartment_number ?? "") ||
      phone.trim() !== (original.phone ?? "") ||
      email.trim() !== (original.email ?? "")
    );
  }, [
    original,
    lastName,
    firstName,
    passportNumber,
    drivingLicenseNumber,
    pesel,
    residenceCardNumber,
    postalCode,
    city,
    street,
    houseNumber,
    apartmentNumber,
    phone,
    email,
  ]);

  const canSave = isValid && hasChanges && !saving;

  function nullable(value: string) {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  function handlePhoneChange(value: string) {
    const cleaned = value.replace(/[^0-9+\-()\s]/g, "");
    setPhone(cleaned);
  }

  async function handleSave() {
    if (!canSave) return;

    setSaving(true);
    setErrorText("");

    const { error } = await supabase
      .from("drivers")
      .update({
        last_name: lastName.trim(),
        first_name: firstName.trim(),

        passport_number: nullable(passportNumber),
        driving_license_number: nullable(drivingLicenseNumber),

        pesel: nullable(pesel),
        residence_card_number: nullable(residenceCardNumber),

        postal_code: nullable(postalCode),
        city: nullable(city),
        street: nullable(street),
        house_number: nullable(houseNumber),
        apartment_number: nullable(apartmentNumber),

        phone: nullable(phone),
        email: nullable(email),

        updated_at: new Date().toISOString(),
      })
      .eq("id", driverId);

    if (error) {
      console.error(error);
      setErrorText("Не удалось сохранить изменения.");
      setSaving(false);
      return;
    }

    // ВАЖНО:
    // replace убирает страницу редактирования из истории.
    router.replace(`/drivers/${driverId}`);
  }

  async function handleDeleteDriver() {
    if (!original) return;

    setDeletingDriver(true);
    setDeleteError("");

    const { data: existingRentals, error: rentalsCheckError } = await supabase
      .from("rentals")
      .select("id")
      .eq("driver_id", driverId)
      .limit(1);

    if (rentalsCheckError) {
      console.error(rentalsCheckError);
      setDeleteError(
        "Не удалось проверить историю аренд. Попробуйте ещё раз."
      );
      setDeletingDriver(false);
      return;
    }

    const hasHistory = !!existingRentals && existingRentals.length > 0;

    if (hasHistory && role !== "director") {
      setDeleteError(
        "Нельзя удалить: по этому водителю есть история аренд."
      );
      setDeletingDriver(false);
      return;
    }

    if (hasHistory && role === "director") {
      const { error: archiveError } = await supabase
        .from("drivers")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", driverId);

      if (archiveError) {
        console.error(archiveError);
        setDeleteError("Не удалось удалить водителя. Попробуйте ещё раз.");
        setDeletingDriver(false);
        return;
      }

      router.replace("/drivers");
      return;
    }

    const { error: deleteRowError } = await supabase
      .from("drivers")
      .delete()
      .eq("id", driverId);

    if (deleteRowError) {
      console.error(deleteRowError);
      setDeleteError("Не удалось удалить водителя. Попробуйте ещё раз.");
      setDeletingDriver(false);
      return;
    }

    router.replace("/drivers");
  }

  if (loading) {
    return <main style={loadingStyle}>Загрузка...</main>;
  }

  if (!original) {
    return (
      <main style={pageStyle}>
        <div style={containerStyle}>
          <div style={headerStyle}>
            <div>
              <div style={systemTitleStyle}>MEDUZA SYSTEM</div>
              <h1 style={titleStyle}>
                Редактирование водителя
              </h1>
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
                onClick={() => router.push(`/drivers/${driverId}`)}
                style={secondaryButtonStyle}
              >
                ← Назад
              </button>
            </div>
          </div>

          <div style={errorStyle}>
            {errorText || "Водитель не найден."}
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

            <h1 style={titleStyle}>
              Редактирование водителя
            </h1>
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
              onClick={() => router.push(`/drivers/${driverId}`)}
              style={secondaryButtonStyle}
            >
              ← Назад
            </button>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={twoColumnGridStyle}>
            <Field
              label="Фамилия *"
              value={lastName}
              onChange={setLastName}
            />

            <Field
              label="Имя *"
              value={firstName}
              onChange={setFirstName}
            />
          </div>

          <div style={twoColumnGridStyle}>
            <Field
              label="Номер паспорта"
              value={passportNumber}
              onChange={setPassportNumber}
            />

            <Field
              label="Номер водительского удостоверения"
              value={drivingLicenseNumber}
              onChange={setDrivingLicenseNumber}
            />
          </div>

          <div style={twoColumnGridStyle}>
            <Field
              label="PESEL"
              value={pesel}
              onChange={setPesel}
            />

            <Field
              label="Номер карты побыту"
              value={residenceCardNumber}
              onChange={setResidenceCardNumber}
            />
          </div>

          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>
              Адрес проживания
            </div>

            <div style={addressGridStyle}>
              <Field
                label="Почтовый индекс"
                value={postalCode}
                onChange={setPostalCode}
                placeholder="44-100"
              />

              <Field
                label="Город"
                value={city}
                onChange={setCity}
              />

              <Field
                label="Улица"
                value={street}
                onChange={setStreet}
              />

              <Field
                label="Дом"
                value={houseNumber}
                onChange={setHouseNumber}
              />

              <Field
                label="Квартира"
                value={apartmentNumber}
                onChange={setApartmentNumber}
              />
            </div>
          </div>

          <div style={twoColumnGridStyle}>
            <PhoneField
              label="Телефон"
              value={phone}
              onChange={handlePhoneChange}
            />

            <Field
              label="Email"
              value={email}
              onChange={setEmail}
              type="email"
            />
          </div>

          {errorText && (
            <div style={errorStyle}>
              {errorText}
            </div>
          )}

          <div style={footerStyle}>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              style={{
                ...saveButtonStyle,
                background: canSave
                  ? "#2563eb"
                  : "#374151",
                cursor: canSave
                  ? "pointer"
                  : "not-allowed",
                opacity: saving ? 0.8 : 1,
              }}
            >
              {saving
                ? "Сохранение..."
                : "Сохранить изменения"}
            </button>
          </div>

          {(role === "director" || role === "administrator") && (
            <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid #e5e7eb" }}>
              {confirmingDelete ? (
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ fontSize: 13, color: "#666" }}>
                    Удалить водителя без возможности восстановления?
                  </span>

                  <button
                    type="button"
                    onClick={handleDeleteDriver}
                    disabled={deletingDriver}
                    style={{
                      height: 32,
                      padding: "0 12px",
                      borderRadius: 6,
                      border: "none",
                      background: "#dc2626",
                      color: "white",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: deletingDriver ? "not-allowed" : "pointer",
                    }}
                  >
                    {deletingDriver ? "..." : "Да, удалить"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setConfirmingDelete(false);
                      setDeleteError("");
                    }}
                    disabled={deletingDriver}
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
                    height: 32,
                    padding: "0 12px",
                    borderRadius: 6,
                    border: "1px solid #fca5a5",
                    background: "white",
                    color: "#dc2626",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Удалить водителя
                </button>
              )}

              {deleteError && (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 13,
                    color: "#dc2626",
                    maxWidth: 420,
                  }}
                >
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

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label style={labelStyle}>
        {label}
      </label>

      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) =>
          onChange(e.target.value)
        }
        style={inputStyle}
      />
    </div>
  );
}

function PhoneField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label style={labelStyle}>
        {label}
      </label>

      <input
        type="tel"
        inputMode="tel"
        value={value}
        onChange={(e) =>
          onChange(e.target.value)
        }
        style={inputStyle}
      />
    </div>
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
  maxWidth: "1200px",
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

const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: "12px",
  padding: "24px",
};

const twoColumnGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "20px",
  marginBottom: "20px",
};

const sectionStyle: React.CSSProperties = {
  marginTop: "4px",
  marginBottom: "20px",
  paddingTop: "20px",
  borderTop: "1px solid #e5e7eb",
};

const sectionTitleStyle: React.CSSProperties = {
  marginBottom: "14px",
  fontSize: "15px",
  fontWeight: 700,
  color: "#111827",
};

const addressGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns:
    "150px 1fr 1.4fr 110px 110px",
  gap: "16px",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: "7px",
  fontSize: "13px",
  fontWeight: 600,
  color: "#374151",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: "42px",
  boxSizing: "border-box",
  padding: "0 12px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  background: "#ffffff",
  fontSize: "14px",
  color: "#111827",
  outline: "none",
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

const errorStyle: React.CSSProperties = {
  marginTop: "20px",
  padding: "12px 14px",
  border: "1px solid #ef4444",
  borderRadius: "8px",
  background: "#ffffff",
  color: "#b91c1c",
  fontSize: "14px",
};