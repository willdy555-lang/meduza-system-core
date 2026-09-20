"use client";

import { useEffect, useMemo, useState } from "react";
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
  portal_user_id: string | null;
};

export default function EditOwnerPage() {
  const router = useRouter();
  const params = useParams();
  const ownerId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState("");

  const [original, setOriginal] = useState<Owner | null>(null);
  const [role, setRole] = useState("");

  const [ownerType, setOwnerType] = useState("person");
  const [name, setName] = useState("");
  const [nip, setNip] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletingOwner, setDeletingOwner] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    loadPage();
  }, [ownerId]);

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

    if (profile.role === "rental_manager") {
      router.replace("/partner");
      return;
    }

    setRole(profile.role);

    const { data, error } = await supabase
      .from("vehicle_owners")
      .select("id, owner_type, name, nip, phone, email, notes, portal_user_id")
      .eq("id", ownerId)
      .single();

    if (error || !data) {
      console.error(error);
      setErrorText("Не удалось загрузить данные собственника.");
      setLoading(false);
      return;
    }

    setOriginal(data);

    setOwnerType(data.owner_type ?? "person");
    setName(data.name ?? "");
    setNip(data.nip ?? "");
    setPhone(data.phone ?? "");
    setEmail(data.email ?? "");
    setNotes(data.notes ?? "");

    setLoading(false);
  }

  const isValid = useMemo(() => {
    return name.trim().length > 0;
  }, [name]);

  const hasChanges = useMemo(() => {
    if (!original) return false;

    return (
      ownerType !== (original.owner_type ?? "person") ||
      name.trim() !== (original.name ?? "") ||
      nip.trim() !== (original.nip ?? "") ||
      phone.trim() !== (original.phone ?? "") ||
      email.trim() !== (original.email ?? "") ||
      notes.trim() !== (original.notes ?? "")
    );
  }, [original, ownerType, name, nip, phone, email, notes]);

  const canSave = isValid && hasChanges && !saving;

  function nullable(value: string) {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  async function handleSave() {
    if (!canSave || !original) return;

    setSaving(true);
    setErrorText("");

    const { error } = await supabase
      .from("vehicle_owners")
      .update({
        owner_type: ownerType,
        name: name.trim(),
        nip: ownerType === "company" ? nullable(nip) : null,
        phone: nullable(phone),
        email: nullable(email),
        notes: nullable(notes),
      })
      .eq("id", ownerId);

    if (error) {
      console.error(error);
      setErrorText("Не удалось сохранить изменения.");
      setSaving(false);
      return;
    }

    // Если у собственника есть личный кабинет — держим имя и телефон там
    // в актуальном состоянии тоже, чтобы данные не разъезжались.
    if (original.portal_user_id) {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          full_name: name.trim(),
          phone: nullable(phone),
        })
        .eq("id", original.portal_user_id);

      if (profileError) {
        console.error(profileError);
      }
    }

    // ВАЖНО:
    // replace убирает страницу редактирования из истории.
    router.replace(`/owners/${ownerId}`);
  }

  async function handleDeleteOwner() {
    if (!original) return;

    setDeletingOwner(true);
    setDeleteError("");

    const { data: existingVehicles, error: vehiclesCheckError } =
      await supabase
        .from("vehicles")
        .select("id")
        .eq("owner_id", ownerId)
        .limit(1);

    if (vehiclesCheckError) {
      console.error(vehiclesCheckError);
      setDeleteError(
        "Не удалось проверить автомобили собственника. Попробуйте ещё раз."
      );
      setDeletingOwner(false);
      return;
    }

    const hasVehicles = !!existingVehicles && existingVehicles.length > 0;

    if (hasVehicles && role !== "director") {
      setDeleteError(
        "Нельзя удалить: за этим собственником числятся автомобили."
      );
      setDeletingOwner(false);
      return;
    }

    if (hasVehicles && role === "director") {
      const { error: archiveError } = await supabase
        .from("vehicle_owners")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", ownerId);

      if (archiveError) {
        console.error(archiveError);
        setDeleteError("Не удалось удалить собственника. Попробуйте ещё раз.");
        setDeletingOwner(false);
        return;
      }

      router.replace("/owners");
      return;
    }

    const { error: deleteRowError } = await supabase
      .from("vehicle_owners")
      .delete()
      .eq("id", ownerId);

    if (deleteRowError) {
      console.error(deleteRowError);
      setDeleteError("Не удалось удалить собственника. Попробуйте ещё раз.");
      setDeletingOwner(false);
      return;
    }

    router.replace("/owners");
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
              <h1 style={titleStyle}>Редактирование собственника</h1>
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
                onClick={() => router.push(`/owners/${ownerId}`)}
                style={secondaryButtonStyle}
              >
                ← Назад
              </button>
            </div>
          </div>

          <div style={errorStyle}>
            {errorText || "Собственник не найден."}
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
              Редактирование собственника
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
              onClick={() => router.push(`/owners/${ownerId}`)}
              style={secondaryButtonStyle}
            >
              ← Назад
            </button>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>
              Тип собственника
            </label>

            <select
              value={ownerType}
              onChange={(e) => setOwnerType(e.target.value)}
              style={{ ...inputStyle, maxWidth: 340 }}
            >
              <option value="person">Физическое лицо</option>
              <option value="company">Компания</option>
            </select>
          </div>

          <div style={twoColumnGridStyle}>
            <Field
              label={
                ownerType === "company"
                  ? "Название компании *"
                  : "Имя и фамилия *"
              }
              value={name}
              onChange={setName}
            />

            <PhoneField
              label="Телефон"
              value={phone}
              onChange={setPhone}
            />
          </div>

          <div style={twoColumnGridStyle}>
            <Field
              label="Email"
              value={email}
              onChange={setEmail}
              type="email"
            />

            {ownerType === "company" && (
              <Field label="НИП" value={nip} onChange={setNip} />
            )}
          </div>

          <div>
            <label style={labelStyle}>Примечание</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={textareaStyle}
            />
          </div>

          {errorText && (
            <div style={errorStyle}>
              {errorText}
            </div>
          )}

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
            <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid #e5e7eb" }}>
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
                    Удалить собственника без возможности восстановления?
                  </span>

                  <button
                    type="button"
                    onClick={handleDeleteOwner}
                    disabled={deletingOwner}
                    style={{
                      height: 32,
                      padding: "0 12px",
                      borderRadius: 6,
                      border: "none",
                      background: "#dc2626",
                      color: "white",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: deletingOwner ? "not-allowed" : "pointer",
                    }}
                  >
                    {deletingOwner ? "..." : "Да, удалить"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setConfirmingDelete(false);
                      setDeleteError("");
                    }}
                    disabled={deletingOwner}
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
                  Удалить собственника
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
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>

      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      />
    </div>
  );
}

function PhoneField({
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
        type="tel"
        inputMode="tel"
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
  minHeight: "100px",
  boxSizing: "border-box",
  padding: "12px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  background: "#ffffff",
  fontSize: "14px",
  color: "#111827",
  outline: "none",
  resize: "vertical",
  fontFamily: "inherit",
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
