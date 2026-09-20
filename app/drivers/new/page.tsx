"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

export default function NewDriverPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState("");

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

  useEffect(() => {
    checkAccess();
  }, []);

  async function checkAccess() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("role, active")
      .eq("id", user.id)
      .single();

    if (error || !profile || !profile.active) {
      await supabase.auth.signOut();
      router.replace("/login");
      return;
    }

    if (profile.role === "vehicle_owner") {
      router.replace("/owner");
      return;
    }

    setLoading(false);
  }

  const canSave = useMemo(() => {
    return (
      lastName.trim().length > 0 &&
      firstName.trim().length > 0 &&
      passportNumber.trim().length > 0 &&
      drivingLicenseNumber.trim().length > 0 &&
      pesel.trim().length > 0 &&
      postalCode.trim().length > 0 &&
      city.trim().length > 0 &&
      street.trim().length > 0 &&
      houseNumber.trim().length > 0 &&
      phone.trim().length > 0 &&
      email.trim().length > 0
    );
  }, [
    lastName,
    firstName,
    passportNumber,
    drivingLicenseNumber,
    pesel,
    postalCode,
    city,
    street,
    houseNumber,
    phone,
    email,
  ]);

  function nullable(value: string) {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  function handlePhoneChange(value: string) {
    const cleaned = value.replace(/[^0-9+\-()\s]/g, "");
    setPhone(cleaned);
  }

  async function handleSave() {
    if (!canSave || saving) return;

    setSaving(true);
    setErrorText("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    const { data, error } = await supabase
      .from("drivers")
      .insert({
        last_name: lastName.trim(),
        first_name: firstName.trim(),

        passport_number: passportNumber.trim(),
        driving_license_number: drivingLicenseNumber.trim(),

        pesel: pesel.trim(),
        residence_card_number: nullable(residenceCardNumber),

        postal_code: postalCode.trim(),
        city: city.trim(),
        street: street.trim(),
        house_number: houseNumber.trim(),
        apartment_number: nullable(apartmentNumber),

        phone: phone.trim(),
        email: email.trim(),

        created_by: user.id,
      })
      .select("id")
      .single();

    if (error) {
      console.error(error);
      setErrorText("Не удалось создать водителя.");
      setSaving(false);
      return;
    }

    router.replace(`/drivers/${data.id}`);
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
            <h1 style={titleStyle}>Добавить водителя</h1>
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
              onClick={() => router.push("/drivers")}
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
              label="Номер паспорта *"
              value={passportNumber}
              onChange={setPassportNumber}
            />

            <Field
              label="Номер водительского удостоверения *"
              value={drivingLicenseNumber}
              onChange={setDrivingLicenseNumber}
            />
          </div>

          <div style={twoColumnGridStyle}>
            <Field
              label="PESEL *"
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
                label="Почтовый индекс *"
                value={postalCode}
                onChange={setPostalCode}
                placeholder="44-100"
              />

              <Field
                label="Город *"
                value={city}
                onChange={setCity}
              />

              <Field
                label="Улица *"
                value={street}
                onChange={setStreet}
              />

              <Field
                label="Дом *"
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
              label="Телефон *"
              value={phone}
              onChange={handlePhoneChange}
            />

            <Field
              label="Email *"
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
              disabled={!canSave || saving}
              style={{
                ...saveButtonStyle,
                background:
                  canSave && !saving
                    ? "#2563eb"
                    : "#374151",
                cursor:
                  canSave && !saving
                    ? "pointer"
                    : "not-allowed",
                opacity: saving ? 0.8 : 1,
              }}
            >
              {saving
                ? "Сохранение..."
                : "Создать водителя"}
            </button>
          </div>
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
        onChange={(e) => onChange(e.target.value)}
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
        onChange={(e) => onChange(e.target.value)}
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
  color: "#b91c1c",
  fontSize: "14px",
};