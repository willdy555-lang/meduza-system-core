"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";

type Props = {
  active: boolean;
  onScan: (code: string) => void;
  onError?: (message: string) => void;
  // Непрерывный режим: камера не выключается после первого считанного
  // кода, а продолжает работать дальше — удобно, когда нужно провести
  // подряд много товаров (приём/выдача со склада). cooldownMs — пауза
  // после каждого успешного скана, чтобы один и тот же штрихкод не
  // считался повторно, пока он ещё в кадре.
  continuous?: boolean;
  cooldownMs?: number;
};

// Сканер штрихкода прямо в браузере, через камеру телефона/планшета.
// Библиотека html5-qrcode грузится с CDN (в проекте её ставить не нужно),
// работает без отдельного оборудования — подходит и для iPhone/iPad, и
// для Android, и для обычного компьютера с камерой.
export default function BarcodeScanner({
  active,
  onScan,
  onError,
  continuous = false,
  cooldownMs = 2000,
}: Props) {
  const [scriptReady, setScriptReady] = useState(false);
  const scannerRef = useRef<any>(null);
  const elementId = "barcode-scanner-view";

  useEffect(() => {
    if (!active || !scriptReady) return;

    const Html5Qrcode = (window as any).Html5Qrcode;
    const Html5QrcodeSupportedFormats = (window as any)
      .Html5QrcodeSupportedFormats;

    if (!Html5Qrcode) {
      onError?.("Не удалось загрузить модуль сканера. Проверьте интернет.");
      return;
    }

    const scanner = new Html5Qrcode(elementId, {
      formatsToSupport: [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
      ],
      verbose: false,
    });

    scannerRef.current = scanner;
    let stopped = false;
    let coolingDown = false;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 260, height: 160 } },
        (decodedText: string) => {
          if (stopped || coolingDown) return;

          if (continuous) {
            coolingDown = true;
            onScan(decodedText);
            setTimeout(() => {
              coolingDown = false;
            }, cooldownMs);
          } else {
            stopped = true;
            onScan(decodedText);
          }
        },
        () => {
          // Обычные неудачные попытки распознать кадр — это не ошибка,
          // просто в кадре пока не видно штрихкода. Игнорируем.
        }
      )
      .catch((err: any) => {
        console.error(err);
        onError?.(
          "Не удалось включить камеру. Разрешите доступ к камере в браузере."
        );
      });

    return () => {
      if (scannerRef.current) {
        scannerRef.current
          .stop()
          .then(() => scannerRef.current?.clear())
          .catch(() => {});
      }
    };
  }, [active, scriptReady, onScan, onError, continuous, cooldownMs]);

  return (
    <>
      <Script
        src="https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
      />

      {active && (
        <div
          id={elementId}
          style={{
            width: "100%",
            maxWidth: 420,
            borderRadius: 12,
            overflow: "hidden",
            border: "1px solid #d1d5db",
            background: "#000",
          }}
        />
      )}
    </>
  );
}
