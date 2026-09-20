"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

type OwnerData = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

type Vehicle = {
  id: string;
  internal_code: string;
  plate_number: string;
  make: string | null;
  model: string | null;
  production_year: number | null;
  status: string;
  current_mileage: number;
};

export default function OwnerCabinetPage() {
  const [owner, setOwner] = useState<OwnerData | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadCabinet() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/login";
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role, active")
        .eq("id", user.id)
        .single();

      if (profileError || !profile) {
        setMessage("Профиль пользователя не найден.");
        setLoading(false);
        return;
      }

      if (profile.role !== "vehicle_owner") {
        window.location.href = "/";
        return;
      }

      const { data: ownerData, error: ownerError } = await supabase
        .from("vehicle_owners")
        .select("id, name, phone, email")
        .eq("portal_user_id", user.id)
        .single();

      if (ownerError || !ownerData) {
        setMessage("Карточка собственника не найдена.");
        setLoading(false);
        return;
      }

      setOwner(ownerData);

      const { data: vehicleData, error: vehicleError } = await supabase
        .from("vehicles")
        .select(
          "id, internal_code, plate_number, make, model, production_year, status, current_mileage"
        )
        .eq("owner_id", ownerData.id)
        .is("archived_at", null)
        .order("plate_number");

      if (vehicleError) {
        setMessage("Ошибка загрузки автомобилей: " + vehicleError.message);
        setLoading(false);
        return;
      }

      setVehicles(vehicleData ?? []);
      setLoading(false);
    }

    loadCabinet();
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (loading) {
    return (
      <main style={{ padding: 32 }}>
        Загрузка...
      </main>
    );
  }

  if (message) {
    return (
      <main style={{ padding: 32 }}>
        <div>{message}</div>
      </main>
    );
  }

  return (
    <main
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: 32,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 28,
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>
            Личный кабинет
          </h1>

          <div
            style={{
              color: "#666",
              marginTop: 5,
            }}
          >
            {owner?.name}
          </div>
        </div>

        <button
          onClick={logout}
          style={{
            height: 42,
            padding: "0 18px",
            borderRadius: 8,
            border: "1px solid #aaa",
            background: "white",
            cursor: "pointer",
          }}
        >
          Выйти
        </button>
      </div>

      <div
        style={{
          background: "white",
          borderRadius: 12,
          border: "1px solid #e5e5e5",
          padding: 22,
          marginBottom: 24,
        }}
      >
        <h2 style={{ marginTop: 0 }}>
          Мои данные
        </h2>

        <div style={{ marginBottom: 8 }}>
          <strong>Собственник:</strong>{" "}
          {owner?.name}
        </div>

        <div style={{ marginBottom: 8 }}>
          <strong>Телефон:</strong>{" "}
          {owner?.phone || "—"}
        </div>

        <div>
          <strong>Email:</strong>{" "}
          {owner?.email || "—"}
        </div>
      </div>

      <div
        style={{
          background: "white",
          borderRadius: 12,
          border: "1px solid #e5e5e5",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: 20,
            borderBottom: "1px solid #eee",
          }}
        >
          <h2 style={{ margin: 0 }}>
            Мои автомобили
          </h2>
        </div>

        {vehicles.length === 0 ? (
          <div style={{ padding: 24 }}>
            Автомобили пока не привязаны.
          </div>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
            }}
          >
            <thead>
              <tr
                style={{
                  background: "#f5f5f5",
                  textAlign: "left",
                }}
              >
                <th style={{ padding: 14 }}>Код</th>
                <th style={{ padding: 14 }}>Автомобиль</th>
                <th style={{ padding: 14 }}>Гос. номер</th>
                <th style={{ padding: 14 }}>Год</th>
                <th style={{ padding: 14 }}>Пробег</th>
                <th style={{ padding: 14 }}>Статус</th>
              </tr>
            </thead>

            <tbody>
              {vehicles.map((vehicle) => (
                <tr
                  key={vehicle.id}
                  style={{
                    borderTop: "1px solid #eee",
                  }}
                >
                  <td style={{ padding: 14 }}>
                    {vehicle.internal_code}
                  </td>

                  <td style={{ padding: 14 }}>
                    {vehicle.make} {vehicle.model}
                  </td>

                  <td style={{ padding: 14 }}>
                    {vehicle.plate_number}
                  </td>

                  <td style={{ padding: 14 }}>
                    {vehicle.production_year || "—"}
                  </td>

                  <td style={{ padding: 14 }}>
                    {vehicle.current_mileage.toLocaleString()}
                  </td>

                  <td style={{ padding: 14 }}>
                    {vehicle.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}