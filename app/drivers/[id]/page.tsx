"use client";

import { useEffect, useState } from "react";
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

export default function DriverViewPage() {
  const router = useRouter();
  const params = useParams();

  const driverId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [errorText, setErrorText] = useState("");

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

    setDriver(data);
    setLoading(false);
  }

  function buildAddress() {
    if (!driver) return "—";

    const cityPart = [driver.postal_code, driver.city]
      .filter(Boolean)
      .join(" ");

    let streetPart = "";

    if (driver.street && driver.house_number) {
      streetPart = `${driver.street} ${driver.house_number}`;
    } else if (driver.street) {
      streetPart = driver.street;
    } else if (driver.house_number) {
      streetPart = driver.house_number;
    }

    if (streetPart && driver.apartment_number) {
      streetPart += `/${driver.apartment_number}`;
    }

    const result = [cityPart, streetPart]
      .filter(Boolean)
      .join(", ");

    return result || "—";
  }

  if (loading) {
    return <main style={loadingStyle}>Загрузка...</main>;
  }

  if (!driver) {
    return (
      <main style={pageStyle}>
        <div style={containerStyle}>
          <div style={headerStyle}>
            <div>
              <div style={systemTitleStyle}>MEDUZA SYSTEM</div>
              <h1 style={titleStyle}>Водитель</h1>
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
              Просмотр водителя
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
              onClick={() => router.push("/drivers")}
              style={secondaryButtonStyle}
            >
              ← Назад
            </button>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={twoColumnGridStyle}>
            <ViewField
              label="Фамилия"
              value={driver.last_name}
            />

            <ViewField
              label="Имя"
              value={driver.first_name}
            />
          </div>

          <div style={twoColumnGridStyle}>
            <ViewField
              label="Номер паспорта"
              value={driver.passport_number}
            />

            <ViewField
              label="Номер водительского удостоверения"
              value={driver.driving_license_number}
            />
          </div>

          <div style={twoColumnGridStyle}>
            <ViewField
              label="PESEL"
              value={driver.pesel}
            />

            <ViewField
              label="Номер карты побыту"
              value={driver.residence_card_number}
            />
          </div>

          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>
              Адрес проживания
            </div>

            <div style={addressValueStyle}>
              {buildAddress()}
            </div>
          </div>

          <div style={twoColumnGridStyle}>
            <ViewField
              label="Телефон"
              value={driver.phone}
            />

            <ViewField
              label="Email"
              value={driver.email}
            />
          </div>

        </div>
      </div>
    </main>
  );
}

function ViewField({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div>
      <div style={labelStyle}>
        {label}
      </div>

      <div style={valueStyle}>
        {value || "—"}
      </div>
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
  marginBottom: "8px",
  fontSize: "13px",
  fontWeight: 600,
  color: "#6b7280",
};

const labelStyle: React.CSSProperties = {
  marginBottom: "7px",
  fontSize: "13px",
  fontWeight: 600,
  color: "#6b7280",
};

const valueStyle: React.CSSProperties = {
  minHeight: "42px",
  display: "flex",
  alignItems: "center",
  padding: "0 12px",
  border: "1px solid #e5e7eb",
  borderRadius: "8px",
  background: "#f9fafb",
  fontSize: "14px",
  color: "#111827",
};

const addressValueStyle: React.CSSProperties = {
  minHeight: "42px",
  display: "flex",
  alignItems: "center",
  padding: "0 12px",
  border: "1px solid #e5e7eb",
  borderRadius: "8px",
  background: "#f9fafb",
  fontSize: "14px",
  color: "#111827",
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
  padding: "14px 16px",
  border: "1px solid #ef4444",
  borderRadius: "8px",
  background: "#ffffff",
  color: "#b91c1c",
  fontSize: "14px",
};