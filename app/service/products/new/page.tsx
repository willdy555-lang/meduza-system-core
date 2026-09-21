"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

const ALLOWED_ROLES = ["director", "administrator", "service_manager"];

function NewProductPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState("");

  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState(() => searchParams.get("barcode") ?? "");
  const [unit, setUnit] = useState("pcs");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [salePriceTouched, setSalePriceTouched] = useState(false);
  const [supplier, setSupplier] = useState("");
  const [initialQuantity, setInitialQuantity] = useState("");

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

    if (!ALLOWED_ROLES.includes(profile.role)) {
      router.replace("/");
      return;
    }

    setLoading(false);
  }

  // Продажная цена сама подставляется как закупочная + 15%, пока
  // пользователь не поправит её вручную.
  function handlePurchasePriceChange(value: string) {
    setPurchasePrice(value);

    if (!salePriceTouched) {
      const parsed = parseFloat(value.replace(",", "."));
      if (!isNaN(parsed) && parsed >= 0) {
        setSalePrice((parsed * 1.15).toFixed(2));
      } else {
        setSalePrice("");
      }
    }
  }

  function handleSalePriceChange(value: string) {
    setSalePriceTouched(true);
    setSalePrice(value);
  }

  const canSave = useMemo(() => {
    const purchase = parseFloat(purchasePrice.replace(",", "."));
    const sale = parseFloat(salePrice.replace(",", "."));
    const qty = initialQuantity.trim()
      ? parseFloat(initialQuantity.replace(",", "."))
      : 0;

    return (
      name.trim().length > 0 &&
      !isNaN(purchase) &&
      purchase >= 0 &&
      !isNaN(sale) &&
      sale >= 0 &&
      !isNaN(qty) &&
      qty >= 0
    );
  }, [name, purchasePrice, salePrice, initialQuantity]);

  async function handleSave() {
    if (!canSave || saving) return;

    setSaving(true);
    setErrorText("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const trimmedBarcode = barcode.trim();
    const qty = initialQuantity.trim()
      ? parseFloat(initialQuantity.replace(",", "."))
      : 0;

    const { error } = await supabase.from("products").insert({
      name: name.trim(),
      barcode: trimmedBarcode.length > 0 ? trimmedBarcode : null,
      unit,
      quantity: qty,
      purchase_price: parseFloat(purchasePrice.replace(",", ".")),
      sale_price: parseFloat(salePrice.replace(",", ".")),
      supplier: supplier.trim().length > 0 ? supplier.trim() : null,
      created_by: user?.id ?? null,
    });

    if (error) {
      console.error(error);
      if (error.message?.includes("products_barcode_unique")) {
        setErrorText("Товар с таким штрихкодом уже есть на складе.");
      } else {
        setErrorText("Не удалось сохранить товар.");
      }
      setSaving(false);
      return;
    }

    router.replace("/service/products");
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
            <h1 style={titleStyle}>Добавить товар</h1>
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

        <div style={cardStyle}>
          <div style={twoColumnGridStyle}>
            <Field label="Название *" value={name} onChange={setName} />

            <Field
              label="Штрихкод"
              value={barcode}
              onChange={setBarcode}
              placeholder="Если есть на упаковке — впишите или отсканируйте позже"
            />
          </div>

          <div style={twoColumnGridStyle}>
            <div>
              <label style={labelStyle}>Единица измерения</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                style={inputStyle}
              >
                <option value="pcs">Штуки</option>
                <option value="liter">Литры</option>
              </select>
            </div>

            <Field
              label="Начальный остаток"
              value={initialQuantity}
              onChange={setInitialQuantity}
              placeholder="0"
            />
          </div>

          <div style={twoColumnGridStyle}>
            <Field
              label="Закупочная цена *"
              value={purchasePrice}
              onChange={handlePurchasePriceChange}
              placeholder="0.00"
            />

            <Field
              label="Продажная цена * (закупка +15%)"
              value={salePrice}
              onChange={handleSalePriceChange}
              placeholder="0.00"
            />
          </div>

          <Field
            label="Поставщик"
            value={supplier}
            onChange={setSupplier}
          />

          {errorText && <div style={errorStyle}>{errorText}</div>}

          <div style={footerStyle}>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave || saving}
              style={{
                ...saveButtonStyle,
                background: canSave && !saving ? "#2563eb" : "#374151",
                cursor: canSave && !saving ? "pointer" : "not-allowed",
                opacity: saving ? 0.8 : 1,
              }}
            >
              {saving ? "Сохранение..." : "Сохранить товар"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function NewProductPage() {
  return (
    <Suspense fallback={<main style={loadingStyle}>Загрузка...</main>}>
      <NewProductPageInner />
    </Suspense>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
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
  maxWidth: "1100px",
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
