"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

const ALLOWED_ROLES = ["director", "administrator", "service_manager", "warehouse_keeper"];

type Product = {
  id: string;
  name: string;
  barcode: string | null;
  unit: string;
  purchase_price: number;
  sale_price: number;
  supplier: string | null;
};

export default function EditProductPage() {
  const router = useRouter();
  const params = useParams();
  const productId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState("");

  const [original, setOriginal] = useState<Product | null>(null);
  const [role, setRole] = useState("");

  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [salePriceTouched, setSalePriceTouched] = useState(false);
  const [supplier, setSupplier] = useState("");

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

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

    setRole(profile.role);

    const { data, error } = await supabase
      .from("products")
      .select("id, name, barcode, unit, purchase_price, sale_price, supplier")
      .eq("id", productId)
      .single();

    if (error || !data) {
      console.error(error);
      setErrorText("Не удалось загрузить товар.");
      setLoading(false);
      return;
    }

    setOriginal(data);
    setName(data.name ?? "");
    setBarcode(data.barcode ?? "");
    setUnit(data.unit ?? "pcs");
    setPurchasePrice(String(data.purchase_price ?? ""));
    setSalePrice(String(data.sale_price ?? ""));
    setSupplier(data.supplier ?? "");

    setLoading(false);
  }

  function handlePurchasePriceChange(value: string) {
    setPurchasePrice(value);

    if (!salePriceTouched) {
      const parsed = parseFloat(value.replace(",", "."));
      if (!isNaN(parsed) && parsed >= 0) {
        setSalePrice((parsed * 1.15).toFixed(2));
      }
    }
  }

  function handleSalePriceChange(value: string) {
    setSalePriceTouched(true);
    setSalePrice(value);
  }

  const isValid = useMemo(() => {
    const purchase = parseFloat(purchasePrice.replace(",", "."));
    const sale = parseFloat(salePrice.replace(",", "."));

    return (
      name.trim().length > 0 &&
      !isNaN(purchase) &&
      purchase >= 0 &&
      !isNaN(sale) &&
      sale >= 0
    );
  }, [name, purchasePrice, salePrice]);

  const hasChanges = useMemo(() => {
    if (!original) return false;

    return (
      name.trim() !== (original.name ?? "") ||
      barcode.trim() !== (original.barcode ?? "") ||
      unit !== (original.unit ?? "pcs") ||
      purchasePrice.trim() !== String(original.purchase_price ?? "") ||
      salePrice.trim() !== String(original.sale_price ?? "") ||
      supplier.trim() !== (original.supplier ?? "")
    );
  }, [original, name, barcode, unit, purchasePrice, salePrice, supplier]);

  const canSave = isValid && hasChanges && !saving;

  function nullable(value: string) {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  async function handleSave() {
    if (!canSave) return;

    setSaving(true);
    setErrorText("");

    const { error } = await supabase
      .from("products")
      .update({
        name: name.trim(),
        barcode: nullable(barcode),
        unit,
        purchase_price: parseFloat(purchasePrice.replace(",", ".")),
        sale_price: parseFloat(salePrice.replace(",", ".")),
        supplier: nullable(supplier),
        updated_at: new Date().toISOString(),
      })
      .eq("id", productId);

    if (error) {
      console.error(error);
      if (error.message?.includes("products_barcode_unique")) {
        setErrorText("Товар с таким штрихкодом уже есть на складе.");
      } else {
        setErrorText("Не удалось сохранить изменения.");
      }
      setSaving(false);
      return;
    }

    router.replace(`/service/products/${productId}`);
  }

  async function handleDeleteProduct() {
    if (!original) return;

    setDeleting(true);
    setDeleteError("");

    const { data: existingMovements, error: movementsCheckError } =
      await supabase
        .from("product_movements")
        .select("id")
        .eq("product_id", productId)
        .limit(1);

    if (movementsCheckError) {
      console.error(movementsCheckError);
      setDeleteError("Не удалось проверить историю движений. Попробуйте ещё раз.");
      setDeleting(false);
      return;
    }

    const hasHistory = !!existingMovements && existingMovements.length > 0;

    if (hasHistory && role !== "director") {
      setDeleteError(
        "Нельзя удалить: по этому товару есть история прихода/продаж."
      );
      setDeleting(false);
      return;
    }

    if (hasHistory && role === "director") {
      const { error: archiveError } = await supabase
        .from("products")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", productId);

      if (archiveError) {
        console.error(archiveError);
        setDeleteError("Не удалось удалить товар. Попробуйте ещё раз.");
        setDeleting(false);
        return;
      }

      router.replace("/service/products");
      return;
    }

    const { error: deleteRowError } = await supabase
      .from("products")
      .delete()
      .eq("id", productId);

    if (deleteRowError) {
      console.error(deleteRowError);
      setDeleteError("Не удалось удалить товар. Попробуйте ещё раз.");
      setDeleting(false);
      return;
    }

    router.replace("/service/products");
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
              <h1 style={titleStyle}>Редактирование товара</h1>
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
                onClick={() => router.push(`/service/products/${productId}`)}
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
            <h1 style={titleStyle}>Редактирование товара</h1>
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
              onClick={() => router.push(`/service/products/${productId}`)}
              style={secondaryButtonStyle}
            >
              ← Назад
            </button>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={twoColumnGridStyle}>
            <Field label="Название *" value={name} onChange={setName} />
            <Field label="Штрихкод" value={barcode} onChange={setBarcode} />
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
              label="Поставщик"
              value={supplier}
              onChange={setSupplier}
            />
          </div>

          <div style={twoColumnGridStyle}>
            <Field
              label="Закупочная цена *"
              value={purchasePrice}
              onChange={handlePurchasePriceChange}
            />

            <Field
              label="Продажная цена *"
              value={salePrice}
              onChange={handleSalePriceChange}
            />
          </div>

          {errorText && <div style={errorStyle}>{errorText}</div>}

          <div style={footerStyle}>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              style={{
                ...saveButtonStyle,
                background: canSave ? "#2563eb" : "#374151",
                cursor: canSave ? "pointer" : "not-allowed",
                opacity: saving ? 0.8 : 1,
              }}
            >
              {saving ? "Сохранение..." : "Сохранить изменения"}
            </button>
          </div>

          {(role === "director" || role === "administrator") && (
            <div
              style={{
                marginTop: 20,
                paddingTop: 20,
                borderTop: "1px solid #e5e7eb",
              }}
            >
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
                    Удалить товар без возможности восстановления?
                  </span>

                  <button
                    type="button"
                    onClick={handleDeleteProduct}
                    disabled={deleting}
                    style={{
                      height: 32,
                      padding: "0 12px",
                      borderRadius: 6,
                      border: "none",
                      background: "#dc2626",
                      color: "white",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: deleting ? "not-allowed" : "pointer",
                    }}
                  >
                    {deleting ? "..." : "Да, удалить"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setConfirmingDelete(false);
                      setDeleteError("");
                    }}
                    disabled={deleting}
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
                  Удалить товар
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type="text"
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
