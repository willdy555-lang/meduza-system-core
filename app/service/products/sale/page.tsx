"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import BarcodeScanner from "../../../components/BarcodeScanner";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

const ALLOWED_ROLES = ["director", "administrator", "service_manager", "warehouse_keeper"];
const DISCOUNT_ROLES = ["director", "administrator"];

type Product = {
  id: string;
  internal_code: string;
  name: string;
  barcode: string | null;
  unit: string;
  quantity: number;
  sale_price: number;
};

export default function ProductSalePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState("");

  const [scannerActive, setScannerActive] = useState(false);
  const [scanError, setScanError] = useState("");

  const [manualBarcode, setManualBarcode] = useState("");
  const [searching, setSearching] = useState(false);
  const [notFoundBarcode, setNotFoundBarcode] = useState("");

  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState("");
  const [discountType, setDiscountType] = useState<"none" | "percent" | "amount">(
    "none"
  );
  const [discountValue, setDiscountValue] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [successText, setSuccessText] = useState("");

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

    setRole(profile.role);
    setLoading(false);
  }

  async function findByBarcode(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;

    setSearching(true);
    setErrorText("");
    setSuccessText("");
    setNotFoundBarcode("");
    setScannerActive(false);
    setScanError("");

    const { data, error } = await supabase
      .from("products")
      .select("id, internal_code, name, barcode, unit, quantity, sale_price")
      .eq("barcode", trimmed)
      .is("archived_at", null)
      .maybeSingle();

    if (error) {
      console.error(error);
      setErrorText("Не удалось найти товар по штрихкоду.");
      setSearching(false);
      return;
    }

    if (!data) {
      setNotFoundBarcode(trimmed);
      setProduct(null);
      setSearching(false);
      return;
    }

    setProduct(data);
    setQuantity("");
    setDiscountType("none");
    setDiscountValue("");
    setSearching(false);
  }

  function unitLabel(unit: string) {
    return unit === "liter" ? "л" : "шт";
  }

  const canApplyDiscount = DISCOUNT_ROLES.includes(role);

  const qtyNumber = useMemo(() => {
    const parsed = parseFloat(quantity.replace(",", "."));
    return isNaN(parsed) ? 0 : parsed;
  }, [quantity]);

  const rawTotal = useMemo(() => {
    if (!product) return 0;
    return product.sale_price * qtyNumber;
  }, [product, qtyNumber]);

  const discountAmount = useMemo(() => {
    if (!canApplyDiscount || discountType === "none") return 0;

    const value = parseFloat(discountValue.replace(",", "."));
    if (isNaN(value) || value <= 0) return 0;

    if (discountType === "percent") {
      return Math.min(rawTotal, (rawTotal * value) / 100);
    }

    return Math.min(rawTotal, value);
  }, [canApplyDiscount, discountType, discountValue, rawTotal]);

  const finalTotal = Math.max(rawTotal - discountAmount, 0);

  const canSave = (() => {
    if (!product) return false;
    if (qtyNumber <= 0) return false;
    if (qtyNumber > product.quantity) return false;
    if (saving) return false;

    if (canApplyDiscount && discountType !== "none") {
      const value = parseFloat(discountValue.replace(",", "."));
      if (isNaN(value) || value <= 0) return false;
      if (discountType === "percent" && value > 100) return false;
    }

    return true;
  })();

  async function handleSaveSale() {
    if (!product || !canSave) return;

    setSaving(true);
    setErrorText("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const appliedDiscountType =
      canApplyDiscount && discountType !== "none" ? discountType : null;
    const appliedDiscountValue =
      appliedDiscountType && discountValue.trim()
        ? parseFloat(discountValue.replace(",", "."))
        : null;

    const { error } = await supabase.from("product_movements").insert({
      product_id: product.id,
      movement_type: "sale",
      quantity: qtyNumber,
      unit_price: product.sale_price,
      discount_type: appliedDiscountType,
      discount_value: appliedDiscountValue,
      total_amount: Number(finalTotal.toFixed(2)),
      note: note.trim().length > 0 ? note.trim() : null,
      created_by: user?.id ?? null,
    });

    if (error) {
      console.error(error);
      setErrorText("Не удалось оформить продажу.");
      setSaving(false);
      return;
    }

    setSuccessText(
      `Продажа оформлена: «${product.name}» ×${qtyNumber} на сумму ${finalTotal.toFixed(
        2
      )}.`
    );
    setProduct(null);
    setQuantity("");
    setDiscountType("none");
    setDiscountValue("");
    setNote("");
    setManualBarcode("");
    setSaving(false);
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
            <h1 style={titleStyle}>Продажа товара</h1>
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
          {successText && <div style={successStyle}>{successText}</div>}

          {!product && (
            <>
              <div style={{ marginBottom: 16 }}>
                <button
                  type="button"
                  onClick={() => {
                    setSuccessText("");
                    setScanError("");
                    setScannerActive((value) => !value);
                  }}
                  style={primaryButtonStyle}
                >
                  {scannerActive ? "Остановить камеру" : "Сканировать штрихкод"}
                </button>
              </div>

              {scannerActive && (
                <div style={{ marginBottom: 16 }}>
                  <BarcodeScanner
                    active={scannerActive}
                    onScan={(code) => findByBarcode(code)}
                    onError={(message) => setScanError(message)}
                  />
                </div>
              )}

              {scanError && <div style={errorStyle}>{scanError}</div>}

              <div style={{ marginBottom: 8, fontSize: 13, color: "#6b7280" }}>
                Или введите штрихкод вручную:
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <input
                  type="text"
                  value={manualBarcode}
                  onChange={(e) => setManualBarcode(e.target.value)}
                  placeholder="Штрихкод"
                  style={inputStyle}
                />

                <button
                  type="button"
                  onClick={() => findByBarcode(manualBarcode)}
                  disabled={searching || !manualBarcode.trim()}
                  style={secondaryButtonStyle}
                >
                  Найти
                </button>
              </div>

              {notFoundBarcode && (
                <div style={{ ...errorStyle, marginTop: 16 }}>
                  Товар со штрихкодом «{notFoundBarcode}» не найден на складе.
                </div>
              )}

              {errorText && <div style={errorStyle}>{errorText}</div>}
            </>
          )}

          {product && (
            <div>
              <div style={foundBoxStyle}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>
                  {product.name}
                </div>
                <div style={{ color: "#6b7280", fontSize: 13, marginTop: 4 }}>
                  {product.internal_code} · в наличии {product.quantity}{" "}
                  {unitLabel(product.unit)} · цена {product.sale_price.toFixed(2)}
                </div>
              </div>

              <div style={twoColumnGridStyle}>
                <div>
                  <label style={labelStyle}>
                    Количество ({unitLabel(product.unit)}) *
                  </label>
                  <input
                    type="text"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="0"
                    style={inputStyle}
                    autoFocus
                  />
                  {qtyNumber > product.quantity && (
                    <div style={{ color: "#b91c1c", fontSize: 12, marginTop: 6 }}>
                      На складе только {product.quantity} {unitLabel(product.unit)}.
                    </div>
                  )}
                </div>

                <div>
                  <label style={labelStyle}>Примечание</label>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Например, имя клиента"
                    style={inputStyle}
                  />
                </div>
              </div>

              {canApplyDiscount && (
                <div style={twoColumnGridStyle}>
                  <div>
                    <label style={labelStyle}>Скидка</label>
                    <select
                      value={discountType}
                      onChange={(e) =>
                        setDiscountType(e.target.value as typeof discountType)
                      }
                      style={inputStyle}
                    >
                      <option value="none">Без скидки</option>
                      <option value="percent">В процентах</option>
                      <option value="amount">Фиксированной суммой</option>
                    </select>
                  </div>

                  {discountType !== "none" && (
                    <div>
                      <label style={labelStyle}>
                        {discountType === "percent"
                          ? "Размер скидки (%)"
                          : "Размер скидки (сумма)"}
                      </label>
                      <input
                        type="text"
                        value={discountValue}
                        onChange={(e) => setDiscountValue(e.target.value)}
                        placeholder={discountType === "percent" ? "10" : "50"}
                        style={inputStyle}
                      />
                    </div>
                  )}
                </div>
              )}

              <div style={totalsBoxStyle}>
                <div style={totalsRowStyle}>
                  <span>Сумма без скидки</span>
                  <span>{rawTotal.toFixed(2)}</span>
                </div>

                {discountAmount > 0 && (
                  <div style={totalsRowStyle}>
                    <span>Скидка</span>
                    <span>−{discountAmount.toFixed(2)}</span>
                  </div>
                )}

                <div style={{ ...totalsRowStyle, fontWeight: 700, fontSize: 16 }}>
                  <span>Итого</span>
                  <span>{finalTotal.toFixed(2)}</span>
                </div>
              </div>

              {errorText && <div style={errorStyle}>{errorText}</div>}

              <div style={footerStyle}>
                <button
                  type="button"
                  onClick={() => {
                    setProduct(null);
                    setQuantity("");
                    setDiscountType("none");
                    setDiscountValue("");
                    setNote("");
                  }}
                  style={secondaryButtonStyle}
                >
                  Отмена
                </button>

                <button
                  type="button"
                  onClick={handleSaveSale}
                  disabled={!canSave}
                  style={{
                    ...saveButtonStyle,
                    background: canSave ? "#2563eb" : "#374151",
                    cursor: canSave ? "pointer" : "not-allowed",
                    opacity: saving ? 0.8 : 1,
                  }}
                >
                  {saving ? "Сохранение..." : "Оформить продажу"}
                </button>
              </div>
            </div>
          )}
        </div>
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
  maxWidth: "800px",
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
  gap: "10px",
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

const primaryButtonStyle: React.CSSProperties = {
  height: "44px",
  padding: "0 20px",
  border: "none",
  borderRadius: "8px",
  background: "#2563eb",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
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

const foundBoxStyle: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: "8px",
  background: "#eff6ff",
  border: "1px solid #bfdbfe",
  marginBottom: "20px",
};

const totalsBoxStyle: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: "8px",
  background: "#f9fafb",
  border: "1px solid #e5e7eb",
  marginBottom: "8px",
};

const totalsRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "4px 0",
  fontSize: 14,
};

const successStyle: React.CSSProperties = {
  marginBottom: "16px",
  padding: "12px 14px",
  background: "#f0fdf4",
  border: "1px solid #bbf7d0",
  borderRadius: "8px",
  color: "#166534",
  fontSize: "14px",
};

const errorStyle: React.CSSProperties = {
  marginTop: "16px",
  padding: "12px 14px",
  border: "1px solid #ef4444",
  borderRadius: "8px",
  background: "#ffffff",
  color: "#b91c1c",
  fontSize: "14px",
};
