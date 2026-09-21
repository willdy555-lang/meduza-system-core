"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import BarcodeScanner from "../../../components/BarcodeScanner";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

const ALLOWED_ROLES = ["director", "administrator", "service_manager", "warehouse_keeper"];

type Product = {
  id: string;
  internal_code: string;
  name: string;
  barcode: string | null;
  unit: string;
  quantity: number;
  purchase_price: number;
};

export default function ProductReceiptPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [scannerActive, setScannerActive] = useState(false);
  const [scanError, setScanError] = useState("");

  const [manualBarcode, setManualBarcode] = useState("");
  const [searching, setSearching] = useState(false);
  const [notFoundBarcode, setNotFoundBarcode] = useState("");

  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState("");
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
      .select("id, internal_code, name, barcode, unit, quantity, purchase_price")
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
    setSearching(false);
  }

  function unitLabel(unit: string) {
    return unit === "liter" ? "л" : "шт";
  }

  const canSave = (() => {
    const qty = parseFloat(quantity.replace(",", "."));
    return !!product && !isNaN(qty) && qty > 0 && !saving;
  })();

  async function handleSaveReceipt() {
    if (!product || !canSave) return;

    setSaving(true);
    setErrorText("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const qty = parseFloat(quantity.replace(",", "."));

    const { error } = await supabase.from("product_movements").insert({
      product_id: product.id,
      movement_type: "receipt",
      quantity: qty,
      unit_price: product.purchase_price,
      note: note.trim().length > 0 ? note.trim() : null,
      created_by: user?.id ?? null,
    });

    if (error) {
      console.error(error);
      setErrorText("Не удалось оформить приход.");
      setSaving(false);
      return;
    }

    setSuccessText(
      `Приход оформлен: «${product.name}» +${qty} ${unitLabel(product.unit)}.`
    );
    setProduct(null);
    setQuantity("");
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
            <h1 style={titleStyle}>Приход товара</h1>
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
          {successText && (
            <div style={successStyle}>{successText}</div>
          )}

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
                  Товар со штрихкодом «{notFoundBarcode}» не найден на складе.{" "}
                  <a
                    href={`/service/products/new?barcode=${encodeURIComponent(
                      notFoundBarcode
                    )}`}
                    style={{ color: "#2563eb", fontWeight: 600 }}
                  >
                    Завести новый товар
                  </a>
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
                  {product.internal_code} · остаток {product.quantity}{" "}
                  {unitLabel(product.unit)}
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
                </div>

                <div>
                  <label style={labelStyle}>Примечание</label>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Например, номер накладной"
                    style={inputStyle}
                  />
                </div>
              </div>

              {errorText && <div style={errorStyle}>{errorText}</div>}

              <div style={footerStyle}>
                <button
                  type="button"
                  onClick={() => {
                    setProduct(null);
                    setQuantity("");
                    setNote("");
                  }}
                  style={secondaryButtonStyle}
                >
                  Отмена
                </button>

                <button
                  type="button"
                  onClick={handleSaveReceipt}
                  disabled={!canSave}
                  style={{
                    ...saveButtonStyle,
                    background: canSave ? "#2563eb" : "#374151",
                    cursor: canSave ? "pointer" : "not-allowed",
                    opacity: saving ? 0.8 : 1,
                  }}
                >
                  {saving ? "Сохранение..." : "Оформить приход"}
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
  background: "#f0fdf4",
  border: "1px solid #bbf7d0",
  marginBottom: "20px",
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
