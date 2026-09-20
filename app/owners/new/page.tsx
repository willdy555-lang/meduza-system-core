"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

export default function NewOwnerPage() {
  const router = useRouter();

  const [ownerType, setOwnerType] = useState("person");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nip, setNip] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [checkingAccess, setCheckingAccess] = useState(true);

  useEffect(() => {
    async function checkAccess() {
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

      if (!["director", "administrator"].includes(profile.role)) {
        router.replace("/partner");
        return;
      }

      setCheckingAccess(false);
    }

    checkAccess();
  }, [router]);

  // Можно ли сохранять
  const canSave =
    firstName.trim().length > 0 &&
    (ownerType === "company" || lastName.trim().length > 0) &&
    login.trim().length > 0 &&
    password.length >= 6;

  const fieldStyle = {
    width: "100%",
    height: 46,
    padding: "0 12px",
    fontSize: 15,
    border: "1px solid #cfcfcf",
    borderRadius: 8,
    boxSizing: "border-box" as const,
    background: "white",
    marginTop: 6,
  };

  const labelStyle = {
    display: "block",
    fontSize: 14,
    fontWeight: 600,
  };

  const navButtonStyle = {
    height: 44,
    padding: "0 18px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    background: "white",
    cursor: "pointer",
    fontSize: 14,
  };

  async function saveOwner() {
    if (!canSave || saving) {
      return;
    }

    setMessage("");
    setSaving(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setMessage("Сессия завершена. Войдите в систему заново.");
        setSaving(false);
        return;
      }

      const response = await fetch("/api/owners/create", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },

        body: JSON.stringify({
          ownerType,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          nip: nip.trim(),
          phone: phone.trim(),
          email: email.trim(),
          login: login.trim(),
          password,
          notes: notes.trim(),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error || "Ошибка создания собственника.");
        setSaving(false);
        return;
      }

      router.push("/owners");
      router.refresh();
    } catch (error) {
      console.error("SAVE OWNER ERROR:", error);

      setMessage("Не удалось связаться с сервером.");
      setSaving(false);
    }
  }

  if (checkingAccess) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        Загрузка...
      </main>
    );
  }

  return (
    <main
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: 32,
      }}
    >
      {/* Шапка */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <h1 style={{ marginBottom: 4 }}>
            Добавить собственника
          </h1>

          <div style={{ color: "#666" }}>
            MEDUZA SYSTEM
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
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
      </div>

      {/* Карточка формы */}
      <div
        style={{
          marginTop: 24,
          background: "white",
          borderRadius: 14,
          padding: 26,
          boxShadow: "0 1px 5px rgba(0,0,0,.08)",
        }}
      >
        {/* 1 строка — тип собственника */}
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>
            Тип собственника

            <select
              value={ownerType}
              onChange={(e) => {
                setOwnerType(e.target.value);

                if (e.target.value === "company") {
                  setLastName("");
                } else {
                  setNip("");
                }
              }}
              style={{
                ...fieldStyle,
                maxWidth: 340,
              }}
            >
              <option value="person">
                Физическое лицо
              </option>

              <option value="company">
                Компания
              </option>
            </select>
          </label>
        </div>

        {/* 2 строка — имя / фамилия */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 24,
            marginBottom: 20,
          }}
        >
          <label style={labelStyle}>
            {ownerType === "company"
              ? "Название компании *"
              : "Имя *"}

            <input
              value={firstName}
              onChange={(e) =>
                setFirstName(e.target.value)
              }
              placeholder={
                ownerType === "company"
                  ? "MEDUZA PARTNER Sp. z o.o."
                  : "Владимир"
              }
              style={fieldStyle}
            />
          </label>

          {ownerType === "person" ? (
            <label style={labelStyle}>
              Фамилия *

              <input
                value={lastName}
                onChange={(e) =>
                  setLastName(e.target.value)
                }
                placeholder="Чернов"
                style={fieldStyle}
              />
            </label>
          ) : (
            <label style={labelStyle}>
              НИП

              <input
                value={nip}
                onChange={(e) => setNip(e.target.value)}
                placeholder="000-000-00-00"
                style={fieldStyle}
              />
            </label>
          )}
        </div>

        {/* 3 строка — телефон / email */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 24,
            marginBottom: 20,
          }}
        >
          <label style={labelStyle}>
            Телефон

            <input
              value={phone}
              onChange={(e) =>
                setPhone(e.target.value)
              }
              placeholder="+48 000 000 000"
              style={fieldStyle}
            />
          </label>

          <label style={labelStyle}>
            Email

            <input
              type="email"
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
              placeholder="email@example.com"
              style={fieldStyle}
            />
          </label>
        </div>

        {/* 4 строка — логин / пароль */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 24,
            marginBottom: 20,
          }}
        >
          <label style={labelStyle}>
            Логин для личного кабинета *

            <input
              value={login}
              onChange={(e) =>
                setLogin(e.target.value)
              }
              placeholder="vladimir"
              autoComplete="off"
              style={fieldStyle}
            />
          </label>

          <label style={labelStyle}>
            Пароль для личного кабинета *

            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 6,
              }}
            >
              <input
                type={
                  showPassword
                    ? "text"
                    : "password"
                }
                value={password}
                onChange={(e) =>
                  setPassword(e.target.value)
                }
                placeholder="Минимум 6 символов"
                autoComplete="new-password"
                style={{
                  ...fieldStyle,
                  marginTop: 0,
                  flex: 1,
                }}
              />

              <button
                type="button"
                onClick={() =>
                  setShowPassword(
                    (value) => !value
                  )
                }
                style={{
                  height: 46,
                  padding: "0 14px",
                  borderRadius: 8,
                  border: "1px solid #cfcfcf",
                  background: "white",
                  cursor: "pointer",
                }}
              >
                {showPassword
                  ? "Скрыть"
                  : "Показать"}
              </button>
            </div>
          </label>
        </div>

        {/* 5 строка — примечание */}
        <label style={labelStyle}>
          Примечание

          <textarea
            value={notes}
            onChange={(e) =>
              setNotes(e.target.value)
            }
            placeholder="Дополнительная информация о собственнике"
            style={{
              width: "100%",
              minHeight: 100,
              padding: 12,
              fontSize: 15,
              border: "1px solid #cfcfcf",
              borderRadius: 8,
              boxSizing: "border-box",
              marginTop: 6,
              resize: "vertical",
              fontFamily: "inherit",
            }}
          />
        </label>

        {/* Сообщение об ошибке */}
        {message && (
          <div
            style={{
              marginTop: 20,
              padding: 14,
              border: "1px solid #ddd",
              borderRadius: 8,
              fontWeight: 600,
            }}
          >
            {message}
          </div>
        )}

        {/* Кнопка сохранения */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: 28,
          }}
        >
          <button
            type="button"
            onClick={saveOwner}
            disabled={!canSave || saving}
            style={{
              minWidth: 240,
              height: 46,
              padding: "0 20px",
              borderRadius: 8,
              border: "none",
              fontSize: 15,
              fontWeight: 700,

              background:
                canSave && !saving
                  ? "#2563eb"
                  : "#d1d5db",

              color:
                canSave && !saving
                  ? "white"
                  : "#6b7280",

              cursor:
                canSave && !saving
                  ? "pointer"
                  : "not-allowed",

              transition: "0.2s",
            }}
          >
            {saving
              ? "Создание..."
              : "Сохранить собственника"}
          </button>
        </div>
      </div>
    </main>
  );
}