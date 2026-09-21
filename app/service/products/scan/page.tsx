"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import BarcodeScanner from "../../../components/BarcodeScanner";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

const ALLOWED_ROLES = ["director", "administrator", "service_manager", "warehouse_keeper"];

type Mode = "receipt" | "sale";

type Product = {
  id: string;
  internal_code: string;
  name: string;
  barcode: string | null;
  unit: string;
  quantity: number;
  purchase_price: number;
  sale_price: number;
};

type CatalogEntry = {
  name: string;
  company: string | null;
};

type Stage =
  | "idle"
  | "searching"
  | "found_product"
  | "found_catalog"
  | "unknown"
  | "not_in_stock_for_sale";

type LogItem = {
  id: string;
  time: string;
  mode: Mode;
  name: string;
  quantity: number;
  unit: string;
};

function unitLabel(unit: string) {
  return unit === "liter" ? "л" : "шт";
}

export default function ProductScanPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);

  const [mode, setMode] = useState<Mode | null>(null);
  const [scannerActive, setScannerActive] = useState(false);
  const [scanError, setScanError] = useState("");
  const [manualBarcode, setManualBarcode] = useState("");

  const [stage, setStage] = useState<Stage>("idle");
  const [currentBarcode, setCurrentBarcode] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [catalogEntry, setCatalogEntry] = useState<CatalogEntry | null>(null);

  const [quantity, setQuantity] = useState("");
  const [newName, setNewName] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [newUnit, setNewUnit] = useState("pcs");
  const [newPurchasePrice, setNewPurchasePrice] = useState("");
  const [newSalePrice, setNewSalePrice] = useState("");
  const [newSalePriceTouched, setNewSalePriceTouched] = useState(false);

  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [log, setLog] = useState<LogItem[]>([]);

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

  function resetForNextScan() {
    setStage("idle");
    setCurrentBarcode("");
    setProduct(null);
    setCatalogEntry(null);
    setQuantity("");
    setNewName("");
    setNewCompany("");
    setNewUnit("pcs");
    setNewPurchasePrice("");
    setNewSalePrice("");
    setNewSalePriceTouched(false);
    setErrorText("");
    setManualBarcode("");
  }

  function chooseMode(value: Mode) {
    setMode(value);
    setScannerActive(true);
    setScanError("");
    resetForNextScan();
  }

  function changeMode() {
    setMode(null);
    setScannerActive(false);
    setScanError("");
    resetForNextScan();
  }

  const handleScan = useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (!trimmed || !mode) return;

      resetForNextScan();
      setCurrentBarcode(trimmed);
      setStage("searching");

      const { data: productData, error: productError } = await supabase
        .from("products")
        .select(
          "id, internal_code, name, barcode, unit, quantity, purchase_price, sale_price"
        )
        .eq("barcode", trimmed)
        .is("archived_at", null)
        .maybeSingle();

      if (productError) {
        console.error(productError);
        setErrorText("Не удалось найти товар по штрихкоду.");
        setStage("idle");
        return;
      }

      if (productData) {
        setProduct(productData);
        setStage("found_product");
        return;
      }

      // Товара с таким штрихкодом на складе ещё нет.
      if (mode === "sale") {
        // Продать то, чего никогда не было в приходе, нельзя.
        const { data: catalogData } = await supabase
          .from("barcode_catalog")
          .select("name, company")
          .eq("barcode", trimmed)
          .maybeSingle();

        setCatalogEntry(catalogData ?? null);
        setStage("not_in_stock_for_sale");
        return;
      }

      // Режим "Приём" — ищем в справочнике распознавания штрихкодов.
      const { data: catalogData } = await supabase
        .from("barcode_catalog")
        .select("name, company")
        .eq("barcode", trimmed)
        .maybeSingle();

      if (catalogData) {
        setCatalogEntry(catalogData);
        setNewName(catalogData.name ?? "");
        setNewCompany(catalogData.company ?? "");
        setStage("found_catalog");
      } else {
        setCatalogEntry(null);
        setStage("unknown");
      }
    },
    [mode]
  );

  function handlePurchasePriceChange(value: string) {
    setNewPurchasePrice(value);

    if (!newSalePriceTouched) {
      const parsed = parseFloat(value.replace(",", "."));
      if (!isNaN(parsed) && parsed >= 0) {
        setNewSalePrice((parsed * 1.15).toFixed(2));
      } else {
        setNewSalePrice("");
      }
    }
  }

  function handleSalePriceChange(value: string) {
    setNewSalePriceTouched(true);
    setNewSalePrice(value);
  }

  const qtyNumber = useMemo(() => {
    const parsed = parseFloat(quantity.replace(",", "."));
    return isNaN(parsed) ? NaN : parsed;
  }, [quantity]);

  const canSaveExisting = useMemo(() => {
    if (!product) return false;
    if (isNaN(qtyNumber) || qtyNumber <= 0) return false;
    if (mode === "sale" && qtyNumber > product.quantity) return false;
    return !saving;
  }, [product, qtyNumber, mode, saving]);

  const canSaveNewProduct = useMemo(() => {
    const purchase = parseFloat(newPurchasePrice.replace(",", "."));
    const sale = parseFloat(newSalePrice.replace(",", "."));

    return (
      newName.trim().length > 0 &&
      !isNaN(purchase) &&
      purchase >= 0 &&
      !isNaN(sale) &&
      sale >= 0 &&
      !isNaN(qtyNumber) &&
      qtyNumber > 0 &&
      !saving
    );
  }, [newName, newPurchasePrice, newSalePrice, qtyNumber, saving]);

  async function handleSaveExisting() {
    if (!product || !canSaveExisting || !mode) return;

    setSaving(true);
    setErrorText("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("product_movements").insert({
      product_id: product.id,
      movement_type: mode,
      quantity: qtyNumber,
      unit_price: mode === "receipt" ? product.purchase_price : product.sale_price,
      created_by: user?.id ?? null,
    });

    if (error) {
      console.error(error);
      setErrorText(
        mode === "receipt"
          ? "Не удалось оформить приход."
          : "Не удалось оформить выдачу."
      );
      setSaving(false);
      return;
    }

    setLog((prev) => [
      {
        id: `${Date.now()}`,
        time: new Date().toLocaleTimeString("ru-RU"),
        mode,
        name: product.name,
        quantity: qtyNumber,
        unit: product.unit,
      },
      ...prev,
    ]);

    setSaving(false);
    resetForNextScan();
  }

  async function handleSaveNewProduct() {
    if (!canSaveNewProduct || !currentBarcode) return;

    setSaving(true);
    setErrorText("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const trimmedName = newName.trim();
    const trimmedCompany = newCompany.trim();
    const purchasePrice = parseFloat(newPurchasePrice.replace(",", "."));
    const salePrice = parseFloat(newSalePrice.replace(",", "."));

    const { data: createdProduct, error: createError } = await supabase
      .from("products")
      .insert({
        name: trimmedName,
        barcode: currentBarcode,
        unit: newUnit,
        quantity: 0,
        purchase_price: purchasePrice,
        sale_price: salePrice,
        supplier: trimmedCompany.length > 0 ? trimmedCompany : null,
        created_by: user?.id ?? null,
      })
      .select("id")
      .single();

    if (createError || !createdProduct) {
      console.error(createError);
      if (createError?.message?.includes("products_barcode_unique")) {
        setErrorText("Товар с таким штрихкодом уже есть на складе.");
      } else {
        setErrorText("Не удалось создать товар.");
      }
      setSaving(false);
      return;
    }

    // Если этого штрихкода ещё не было в справочнике распознавания —
    // сохраняем его туда, чтобы в следующий раз система узнала товар сама.
    if (!catalogEntry) {
      const { error: catalogError } = await supabase
        .from("barcode_catalog")
        .insert({
          barcode: currentBarcode,
          name: trimmedName,
          company: trimmedCompany.length > 0 ? trimmedCompany : null,
          created_by: user?.id ?? null,
        });

      if (catalogError) {
        console.error(catalogError);
        // Не блокируем приход товара из-за этого — просто не запомнили
        // штрихкод на будущее.
      }
    }

    const { error: movementError } = await supabase
      .from("product_movements")
      .insert({
        product_id: createdProduct.id,
        movement_type: "receipt",
        quantity: qtyNumber,
        unit_price: purchasePrice,
        created_by: user?.id ?? null,
      });

    if (movementError) {
      console.error(movementError);
      setErrorText(
        "Товар создан, но не удалось оформить приход количества. Откройте его на складе и добавьте приход вручную."
      );
      setSaving(false);
      return;
    }

    setLog((prev) => [
      {
        id: `${Date.now()}`,
        time: new Date().toLocaleTimeString("ru-RU"),
        mode: "receipt",
        name: trimmedName,
        quantity: qtyNumber,
        unit: newUnit,
      },
      ...prev,
    ]);

    setSaving(false);
    resetForNextScan();
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
            <h1 style={titleStyle}>Сканирование склада</h1>
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

        {!mode && (
          <div style={cardStyle}>
            <div style={{ marginBottom: 16, fontSize: 14, color: "#374151" }}>
              Сначала выберите, что вы делаете:
            </div>

            <div style={modeGridStyle}>
              <button
                type="button"
                onClick={() => chooseMode("receipt")}
                style={modeButtonStyle("#2563eb")}
              >
                Приём
              </button>

              <button
                type="button"
                onClick={() => chooseMode("sale")}
                style={modeButtonStyle("#dc2626")}
              >
                Выдача
              </button>
            </div>
          </div>
        )}

        {mode && (
          <>
            <div style={modeBadgeRowStyle}>
              <div
                style={modeBadgeStyle(mode === "receipt" ? "#2563eb" : "#dc2626")}
              >
                Режим: {mode === "receipt" ? "Приём" : "Выдача"}
              </div>

              <button
                type="button"
                onClick={changeMode}
                style={secondaryButtonStyle}
              >
                Сменить режим
              </button>
            </div>

            <div style={cardStyle}>
              {stage === "idle" && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <BarcodeScanner
                      active={scannerActive}
                      continuous
                      onScan={(code) => handleScan(code)}
                      onError={(message) => setScanError(message)}
                    />
                  </div>

                  {scanError && <div style={errorStyle}>{scanError}</div>}

                  <div
                    style={{ marginBottom: 8, fontSize: 13, color: "#6b7280" }}
                  >
                    Или введите/отсканируйте штрихкод вручную (для
                    USB/Bluetooth-сканера тоже подойдёт — он сам печатает
                    цифры и Enter в это поле):
                  </div>

                  <div style={{ display: "flex", gap: 10 }}>
                    <input
                      type="text"
                      value={manualBarcode}
                      onChange={(e) => setManualBarcode(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && manualBarcode.trim()) {
                          handleScan(manualBarcode);
                        }
                      }}
                      placeholder="Штрихкод"
                      style={inputStyle}
                      autoFocus
                    />

                    <button
                      type="button"
                      onClick={() => handleScan(manualBarcode)}
                      disabled={!manualBarcode.trim()}
                      style={secondaryButtonStyle}
                    >
                      Найти
                    </button>
                  </div>

                  {errorText && (
                    <div style={{ ...errorStyle, marginTop: 16 }}>
                      {errorText}
                    </div>
                  )}
                </>
              )}

              {stage === "searching" && (
                <div style={{ color: "#6b7280" }}>Ищем товар…</div>
              )}

              {stage === "found_product" && product && (
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

                  {mode === "sale" &&
                    !isNaN(qtyNumber) &&
                    qtyNumber > product.quantity && (
                      <div style={{ ...errorStyle, marginTop: 12 }}>
                        На складе только {product.quantity}{" "}
                        {unitLabel(product.unit)}.
                      </div>
                    )}

                  {errorText && (
                    <div style={{ ...errorStyle, marginTop: 12 }}>
                      {errorText}
                    </div>
                  )}

                  <div style={footerStyle}>
                    <button
                      type="button"
                      onClick={resetForNextScan}
                      style={secondaryButtonStyle}
                    >
                      Отмена
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveExisting}
                      disabled={!canSaveExisting}
                      style={{
                        ...saveButtonStyle,
                        background:
                          canSaveExisting
                            ? mode === "receipt"
                              ? "#2563eb"
                              : "#dc2626"
                            : "#374151",
                        cursor: canSaveExisting ? "pointer" : "not-allowed",
                        opacity: saving ? 0.8 : 1,
                      }}
                    >
                      {saving
                        ? "Сохранение..."
                        : mode === "receipt"
                        ? "Оформить приход"
                        : "Оформить выдачу"}
                    </button>
                  </div>
                </div>
              )}

              {stage === "not_in_stock_for_sale" && (
                <div>
                  <div style={{ ...errorStyle, marginBottom: 16 }}>
                    Штрихкод «{currentBarcode}» не найден на складе — этот
                    товар ещё не приходовался, продать его нельзя.
                    {catalogEntry && (
                      <>
                        {" "}
                        В справочнике он записан как «{catalogEntry.name}»
                        {catalogEntry.company ? ` (${catalogEntry.company})` : ""}
                        , но на складе его ещё нет.
                      </>
                    )}{" "}
                    Сначала оформите приём.
                  </div>

                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      type="button"
                      onClick={resetForNextScan}
                      style={secondaryButtonStyle}
                    >
                      Сканировать другой товар
                    </button>

                    <button
                      type="button"
                      onClick={() => chooseMode("receipt")}
                      style={primaryButtonStyle}
                    >
                      Перейти в режим «Приём»
                    </button>
                  </div>
                </div>
              )}

              {(stage === "found_catalog" || stage === "unknown") && (
                <div>
                  <div style={{ marginBottom: 16, fontSize: 14, color: "#374151" }}>
                    {stage === "found_catalog"
                      ? "Этого товара ещё нет на складе, но он есть в справочнике распознавания — проверьте данные и укажите цены и количество."
                      : "Штрихкод неизвестен. Впишите название и производителя один раз — в следующий раз система узнает этот штрихкод сама."}
                  </div>

                  <div
                    style={{
                      marginBottom: 12,
                      fontSize: 13,
                      color: "#6b7280",
                    }}
                  >
                    Штрихкод: {currentBarcode}
                  </div>

                  <div style={twoColumnGridStyle}>
                    <Field label="Название *" value={newName} onChange={setNewName} />
                    <Field
                      label="Фирма / производитель"
                      value={newCompany}
                      onChange={setNewCompany}
                    />
                  </div>

                  <div style={twoColumnGridStyle}>
                    <div>
                      <label style={labelStyle}>Единица измерения</label>
                      <select
                        value={newUnit}
                        onChange={(e) => setNewUnit(e.target.value)}
                        style={inputStyle}
                      >
                        <option value="pcs">Штуки</option>
                        <option value="liter">Литры</option>
                      </select>
                    </div>

                    <Field
                      label={`Количество *`}
                      value={quantity}
                      onChange={setQuantity}
                      placeholder="0"
                    />
                  </div>

                  <div style={twoColumnGridStyle}>
                    <Field
                      label="Закупочная цена *"
                      value={newPurchasePrice}
                      onChange={handlePurchasePriceChange}
                      placeholder="0.00"
                    />

                    <Field
                      label="Продажная цена * (закупка +15%)"
                      value={newSalePrice}
                      onChange={handleSalePriceChange}
                      placeholder="0.00"
                    />
                  </div>

                  {errorText && <div style={errorStyle}>{errorText}</div>}

                  <div style={footerStyle}>
                    <button
                      type="button"
                      onClick={resetForNextScan}
                      style={secondaryButtonStyle}
                    >
                      Отмена
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveNewProduct}
                      disabled={!canSaveNewProduct}
                      style={{
                        ...saveButtonStyle,
                        background: canSaveNewProduct ? "#2563eb" : "#374151",
                        cursor: canSaveNewProduct ? "pointer" : "not-allowed",
                        opacity: saving ? 0.8 : 1,
                      }}
                    >
                      {saving ? "Сохранение..." : "Завести товар и оформить приход"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {log.length > 0 && (
          <div style={{ ...cardStyle, marginTop: 20 }}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>
              Отсканировано в этой сессии
            </div>

            {log.map((item) => (
              <div key={item.id} style={logRowStyle}>
                <span style={{ color: "#6b7280", width: 80 }}>{item.time}</span>
                <span
                  style={{
                    color: item.mode === "receipt" ? "#2563eb" : "#dc2626",
                    fontWeight: 600,
                    width: 80,
                  }}
                >
                  {item.mode === "receipt" ? "Приём" : "Выдача"}
                </span>
                <span style={{ flex: 1 }}>{item.name}</span>
                <span>
                  {item.quantity} {unitLabel(item.unit)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
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

const modeGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "16px",
};

function modeButtonStyle(color: string): React.CSSProperties {
  return {
    height: "80px",
    border: "none",
    borderRadius: "12px",
    background: color,
    color: "#ffffff",
    fontSize: "20px",
    fontWeight: 700,
    cursor: "pointer",
  };
}

const modeBadgeRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "16px",
};

function modeBadgeStyle(color: string): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    height: "36px",
    padding: "0 14px",
    borderRadius: "8px",
    background: color,
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: 700,
  };
}

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

const errorStyle: React.CSSProperties = {
  padding: "12px 14px",
  border: "1px solid #ef4444",
  borderRadius: "8px",
  background: "#ffffff",
  color: "#b91c1c",
  fontSize: "14px",
};

const logRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "12px",
  padding: "8px 0",
  borderTop: "1px solid #f0f0f0",
  fontSize: "14px",
};
