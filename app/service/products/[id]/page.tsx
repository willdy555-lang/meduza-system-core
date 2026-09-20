"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

const ALLOWED_ROLES = ["director", "administrator", "service_manager"];

type Product = {
  id: string;
  internal_code: string;
  name: string;
  barcode: string | null;
  unit: string;
  quantity: number;
  purchase_price: number;
  sale_price: number;
  supplier: string | null;
};

type Movement = {
  id: string;
  movement_type: string;
  quantity: number;
  unit_price: number | null;
  total_amount: number | null;
  created_at: string;
};

export default function ProductViewPage() {
  const router = useRouter();
  const params = useParams();
  const productId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState<Product | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    loadPage();
  }, [productId]);

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

    if (!ALLOWED_ROLES.includes(profile.role)) {
      router.replace("/");
      return;
    }

    const { data, error } = await supabase
      .from("products")
      .select(
        "id, internal_code, name, barcode, unit, quantity, purchase_price, sale_price, supplier"
      )
      .eq("id", productId)
      .single();

    if (error || !data) {
      console.error(error);
      setErrorText("Не удалось загрузить товар.");
      setLoading(false);
      return;
    }

    setProduct(data);

    const { data: movementData, error: movementError } = await supabase
      .from("product_movements")
      .select("id, movement_type, quantity, unit_price, total_amount, created_at")
      .eq("product_id", productId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (movementError) {
      console.error(movementError);
    } else {
      setMovements(movementData ?? []);
    }

    setLoading(false);
  }

  function unitLabel(unit: string) {
    return unit === "liter" ? "л" : "шт";
  }

  function movementLabel(type: string) {
    return type === "receipt" ? "Приход" : "Продажа";
  }

  if (loading) {
    return <main style={loadingStyle}>Загрузка...</main>;
  }

  if (!product) {
    return (
      <main style={pageStyle}>
        <div style={containerStyle}>
          <div style={headerStyle}>
            <div>
              <div style={systemTitleStyle}>MEDUZA SYSTEM</div>
              <h1 style={titleStyle}>Товар</h1>
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
                onClick={() => router.push("/service/products")}
                style={secondaryButtonStyle}
              >
                ← Назад
              </button>
            </div>
          </div>

          <div style={errorStyle}>{errorText || "Товар не найден."}</div>
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
            <h1 style={titleStyle}>Просмотр товара</h1>
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
              onClick={() => router.push("/service/products")}
              style={secondaryButtonStyle}
            >
              ← Назад
            </button>

            <button
              type="button"
              onClick={() =>
                router.push(`/service/products/${productId}/edit`)
              }
              style={editButtonStyle}
            >
              Редактировать
            </button>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={twoColumnGridStyle}>
            <ViewField label="Код товара" value={product.internal_code} />
            <ViewField label="Название" value={product.name} />
          </div>

          <div style={twoColumnGridStyle}>
            <ViewField label="Штрихкод" value={product.barcode} />
            <ViewField
              label="Остаток"
              value={`${product.quantity} ${unitLabel(product.unit)}`}
            />
          </div>

          <div style={twoColumnGridStyle}>
            <ViewField
              label="Закупочная цена"
              value={product.purchase_price.toFixed(2)}
            />
            <ViewField
              label="Продажная цена"
              value={product.sale_price.toFixed(2)}
            />
          </div>

          <ViewField label="Поставщик" value={product.supplier} />
        </div>

        <div style={{ ...cardStyle, marginTop: 20 }}>
          <h2 style={sectionTitleStyle}>История движений</h2>

          {movements.length === 0 ? (
            <div style={{ color: "#6b7280", fontSize: 14 }}>
              Движений по этому товару пока нет.
            </div>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={headerCellStyle}>Дата</th>
                  <th style={headerCellStyle}>Тип</th>
                  <th style={headerCellStyle}>Количество</th>
                  <th style={headerCellStyle}>Цена</th>
                  <th style={headerCellStyle}>Сумма</th>
                </tr>
              </thead>

              <tbody>
                {movements.map((movement) => (
                  <tr key={movement.id}>
                    <td style={bodyCellStyle}>
                      {new Date(movement.created_at).toLocaleString("ru-RU")}
                    </td>
                    <td style={bodyCellStyle}>
                      {movementLabel(movement.movement_type)}
                    </td>
                    <td style={bodyCellStyle}>{movement.quantity}</td>
                    <td style={bodyCellStyle}>
                      {movement.unit_price?.toFixed(2) ?? "—"}
                    </td>
                    <td style={bodyCellStyle}>
                      {movement.total_amount?.toFixed(2) ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
      <div style={labelStyle}>{label}</div>
      <div style={valueStyle}>{value || "—"}</div>
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

const sectionTitleStyle: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 16,
  fontSize: 18,
  fontWeight: 700,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const headerCellStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  background: "#f9fafb",
  borderBottom: "1px solid #e5e7eb",
  fontSize: "13px",
  fontWeight: 600,
  color: "#4b5563",
};

const bodyCellStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #eeeeee",
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

const editButtonStyle: React.CSSProperties = {
  height: "42px",
  padding: "0 16px",
  border: "none",
  borderRadius: "8px",
  background: "#2563eb",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: 600,
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
