"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

type Owner = {
  id: string;
  owner_type: string | null;
  name: string;
  nip: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
};

type Vehicle = {
  id: string;
  plate_number: string;
  make: string | null;
  model: string | null;
  production_year: number | null;
  color: string | null;
  current_mileage: number | null;
};

export default function OwnerDetailsPage() {
  const router = useRouter();
  const params = useParams();

  const ownerId = params.id as string;

  const [owner, setOwner] = useState<Owner | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadOwner() {
      setLoading(true);
      setErrorMessage("");

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, active")
        .eq("id", user.id)
        .single();

      if (!profile || !profile.active) {
        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }

      if (profile.role === "vehicle_owner") {
        router.replace("/owner");
        return;
      }

      if (profile.role === "rental_manager") {
        router.replace("/partner");
        return;
      }

      const { data: ownerData, error: ownerError } = await supabase
        .from("vehicle_owners")
        .select("id, owner_type, name, nip, phone, email, notes")
        .eq("id", ownerId)
        .single();

      if (ownerError || !ownerData) {
        console.error(ownerError);
        setErrorMessage("Не удалось загрузить собственника.");
        setLoading(false);
        return;
      }

      setOwner(ownerData);

      const { data: vehicleData, error: vehicleError } = await supabase
        .from("vehicles")
        .select(`
          id,
          plate_number,
          make,
          model,
          production_year,
          color,
          current_mileage
        `)
        .eq("owner_id", ownerId)
        .is("archived_at", null)
        .order("plate_number", { ascending: true });

      if (vehicleError) {
        console.error(vehicleError);
        setErrorMessage("Не удалось загрузить автомобили собственника.");
        setLoading(false);
        return;
      }

      setVehicles(vehicleData ?? []);
      setLoading(false);
    }

    if (ownerId) {
      loadOwner();
    }
  }, [ownerId, router]);

  const navButtonStyle = {
    height: 44,
    padding: "0 18px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    background: "white",
    cursor: "pointer",
    fontSize: 14,
  };

  if (loading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#f5f6f8",
          padding: 32,
        }}
      >
        Загрузка...
      </main>
    );
  }

  if (errorMessage || !owner) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#f5f6f8",
          padding: 32,
        }}
      >
        <div style={{ maxWidth: 1400, margin: "0 auto" }}>
          <div
            style={{
              display: "flex",
              gap: 10,
              marginBottom: 20,
            }}
          >
            <button
              type="button"
              onClick={() => router.push("/")}
              style={navButtonStyle}
            >
              Главное меню
            </button>

            <button
              type="button"
              onClick={() => router.push("/owners")}
              style={navButtonStyle}
            >
              ← Назад
            </button>
          </div>

          <div
            style={{
              background: "white",
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: 24,
            }}
          >
            {errorMessage || "Собственник не найден."}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f5f6f8",
        padding: 32,
      }}
    >
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 14,
                color: "#777",
                marginBottom: 6,
              }}
            >
              MEDUZA SYSTEM
            </div>

            <h1
              style={{
                margin: 0,
                fontSize: 32,
              }}
            >
              {owner.name}
            </h1>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
            }}
          >
            <button
              type="button"
              onClick={() => router.push("/")}
              style={navButtonStyle}
            >
              Главное меню
            </button>

            <button
              type="button"
              onClick={() => router.push("/owners")}
              style={navButtonStyle}
            >
              ← Назад
            </button>

            <button
              type="button"
              onClick={() => router.push(`/owners/${ownerId}/edit`)}
              style={{
                ...navButtonStyle,
                border: "none",
                background: "#2563eb",
                color: "white",
                fontWeight: 600,
              }}
            >
              Редактировать
            </button>
          </div>
        </div>

        <section
          style={{
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: 14,
            padding: 24,
            boxShadow: "0 1px 4px rgba(0,0,0,.05)",
            marginBottom: 20,
          }}
        >
          <h2
            style={{
              marginTop: 0,
              marginBottom: 22,
              fontSize: 22,
            }}
          >
            Данные собственника
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 20,
            }}
          >
            <InfoItem
              label="Тип"
              value={
                owner.owner_type === "company"
                  ? "Компания"
                  : "Физическое лицо"
              }
            />

            <InfoItem
              label="Имя / Название"
              value={owner.name || "—"}
            />

            {owner.owner_type === "company" && (
              <InfoItem label="НИП" value={owner.nip || "—"} />
            )}

            <InfoItem
              label="Телефон"
              value={owner.phone || "—"}
            />

            <InfoItem
              label="Email"
              value={owner.email || "—"}
            />

            <InfoItem
              label="Примечание"
              value={owner.notes || "—"}
            />
          </div>

        </section>

        <section
          style={{
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: 14,
            overflow: "hidden",
            boxShadow: "0 1px 4px rgba(0,0,0,.05)",
          }}
        >
          <div
            style={{
              padding: 20,
              borderBottom: "1px solid #e5e7eb",
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: 22,
              }}
            >
              Автомобили собственника
            </h2>
          </div>

          {vehicles.length === 0 ? (
            <div
              style={{
                padding: 30,
                color: "#666",
              }}
            >
              У этого собственника пока нет автомобилей.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  minWidth: 750,
                }}
              >
                <thead>
                  <tr style={{ background: "#f9fafb" }}>
                    <th style={headerCell}>Гос. номер</th>
                    <th style={headerCell}>Автомобиль</th>
                    <th style={headerCell}>Год</th>
                    <th style={headerCell}>Цвет</th>
                    <th style={headerCell}>Пробег</th>
                  </tr>
                </thead>

                <tbody>
                  {vehicles.map((vehicle) => (
                    <tr
                      key={vehicle.id}
                      style={{
                        borderTop: "1px solid #e5e7eb",
                      }}
                    >
                      <td
                        style={{
                          ...bodyCell,
                          fontWeight: 700,
                        }}
                      >
                        {vehicle.plate_number}
                      </td>

                      <td style={bodyCell}>
                        {[vehicle.make, vehicle.model]
                          .filter(Boolean)
                          .join(" ") || "—"}
                      </td>

                      <td style={bodyCell}>
                        {vehicle.production_year || "—"}
                      </td>

                      <td style={bodyCell}>
                        {vehicle.color || "—"}
                      </td>

                      <td style={bodyCell}>
                        {(vehicle.current_mileage ?? 0).toLocaleString(
                          "ru-RU"
                        )}{" "}
                        км
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function InfoItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 13,
          color: "#777",
          marginBottom: 6,
        }}
      >
        {label}
      </div>

      <div
        style={{
          fontSize: 16,
          fontWeight: 600,
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
}

const headerCell: React.CSSProperties = {
  textAlign: "left",
  padding: "14px 16px",
  fontSize: 13,
  color: "#555",
  fontWeight: 600,
};

const bodyCell: React.CSSProperties = {
  padding: "15px 16px",
  fontSize: 14,
  color: "#111",
};