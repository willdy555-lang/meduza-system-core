"use client";

import { useRouter } from "next/navigation";

export default function AppNavigation() {
  const router = useRouter();

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
      }}
    >
      <button
        type="button"
        onClick={() => router.push("/")}
        style={{
          height: 44,
          padding: "0 18px",
          borderRadius: 8,
          border: "1px solid #d1d5db",
          background: "white",
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        Главное меню
      </button>

      <button
        type="button"
        onClick={() => router.push("/")}
        style={{
          height: 44,
          padding: "0 18px",
          borderRadius: 8,
          border: "1px solid #d1d5db",
          background: "white",
          cursor: "pointer",
          fontSize: 14,
        }}
      >
        ← Назад
      </button>
    </div>
  );
}