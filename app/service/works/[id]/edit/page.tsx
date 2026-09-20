"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

const ALLOWED_ROLES = ["director", "administrator", "service_manager"];

type ServiceJob = {
  id: string;
  name: string;
  price: number;
  description: string | null;
};

export default function EditServiceJobPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState("");

  const [original, setOriginal] = useState<ServiceJob | null>(null);
  const [role, setRole] = useState("");

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    loadPage();
  }, [jobId]);

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
      .from("service_jobs")
      .select("id, name, price, description")
      .eq("id", jobId)
      .single();

    if (error || !data) {
      console.error(error);
      setErrorText("Не удалось загрузить работу.");
      setLoading(false);
      return;
    }

    setOriginal(data);
    setName(data.name ?? "");
    setPrice(String(data.price ?? ""));
    setDescription(data.description ?? "");

    setLoading(false);
  }

  const isValid = useMemo(() => {
    const parsedPrice = parseFloat(price.replace(",", "."));

    return name.trim().length > 0 && !isNaN(parsedPrice) && parsedPrice >= 0;
  }, [name, price]);

  const hasChanges = useMemo(() => {
    if (!original) return false;

    return (
      name.trim() !== (original.name ?? "") ||
      price.trim() !== String(original.price ?? "") ||
      description.trim() !== (original.description ?? "")
    );
  }, [original, name, price, description]);

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
      .from("service_jobs")
      .update({
        name: name.trim(),
        price: parseFloat(price.replace(",", ".")),
        description: nullable(description),
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    if (error) {
      console.error(error);
      setErrorText("Не удалось сохранить изменения.");
      setSaving(false);
      return;
    }

    router.replace(`/service/works/${jobId}`);
  }

  async function handleDeleteJob() {
    if (!original) return;

    setDeleting(true);
    setDeleteError("");

    const { error: archiveError } = await supabase
      .from("service_jobs")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", jobId);

    if (archiveError) {
      console.error(archiveError);
      setDeleteError("Не удалось удалить работу. Попробуйте ещё раз.");
      setDeleting(false);
      return;
    }

    router.replace("/service/works");
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
              <h1 style={titleStyle}>Редактирование работы</h1>
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
                onClick={() => router.push(`/service/works/${jobId}`)}
                style={secondaryButtonStyle}
              >
                ← Назад
              </button>
            </div>
          </div>

          <div style={errorStyle}>{errorText || "Работа не найдена."}</div>
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
            <h1 style={titleStyle}>Редактирование работы</h1>
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
              onClick={() => router.push(`/service/works/${jobId}`)}
              style={secondaryButtonStyle}
            >
              ← Назад
            </button>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={twoColumnGridStyle}>
            <Field label="Название *" value={name} onChange={setName} />
            <Field label="Цена *" value={price} onChange={setPrice} />
          </div>

          <div>
            <label style={labelStyle}>Описание</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={textareaStyle}
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
                    Удалить эту работу из списка?
                  </span>

                  <button
                    type="button"
                    onClick={handleDeleteJob}
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
                  Удалить работу
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

const textareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: "90px",
  boxSizing: "border-box",
  padding: "10px 12px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  background: "#ffffff",
  fontSize: "14px",
  color: "#111827",
  outline: "none",
  fontFamily: "inherit",
  resize: "vertical",
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
