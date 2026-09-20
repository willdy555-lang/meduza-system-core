import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

// ---------- Вспомогательное ----------

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// ---------- Обработчик ----------
// GET /api/rent/[id]/act?type=issue   — акт выдачи (по дате начала аренды)
// GET /api/rent/[id]/act?type=return  — акт возврата (по дате окончания аренды)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let workDir = "";

  try {
    const { searchParams } = new URL(request.url);
    const actType = searchParams.get("type");

    if (actType !== "issue" && actType !== "return") {
      return NextResponse.json(
        { error: "Неизвестный тип акта." },
        { status: 400 }
      );
    }

    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Нет авторизации." },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    const supabase = createClient(supabaseUrl, publishableKey, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json(
        { error: "Сессия недействительна." },
        { status: 401 }
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, active")
      .eq("id", user.id)
      .single();

    if (
      !profile ||
      !profile.active ||
      !["director", "administrator", "rental_manager"].includes(profile.role)
    ) {
      return NextResponse.json(
        { error: "Недостаточно прав." },
        { status: 403 }
      );
    }

    const { id: rentalId } = await params;

    const { data: rental, error: rentalError } = await supabase
      .from("rentals")
      .select("id, started_at, ended_at, vehicle_id, driver_id")
      .eq("id", rentalId)
      .single();

    if (rentalError || !rental) {
      return NextResponse.json(
        { error: "Аренда не найдена." },
        { status: 404 }
      );
    }

    if (actType === "return" && !rental.ended_at) {
      return NextResponse.json(
        { error: "Аренда ещё не завершена — дата возврата не известна." },
        { status: 400 }
      );
    }

    const { data: vehicle } = await supabase
      .from("vehicles")
      .select("make, model, vin, plate_number")
      .eq("id", rental.vehicle_id)
      .single();

    const { data: driver } = await supabase
      .from("drivers")
      .select("last_name, first_name, phone")
      .eq("id", rental.driver_id)
      .single();

    if (!vehicle || !driver) {
      return NextResponse.json(
        { error: "Не удалось загрузить данные автомобиля или водителя." },
        { status: 404 }
      );
    }

    const momentIso = actType === "issue" ? rental.started_at : rental.ended_at;
    const moment = new Date(momentIso as string);
    const actDate = `${pad2(moment.getDate())}.${pad2(
      moment.getMonth() + 1
    )}.${moment.getFullYear()}`;
    const actTime = `${pad2(moment.getHours())}:${pad2(moment.getMinutes())}`;

    const replacements: Record<string, string> = {
      "{{ACT_DATE}}": actDate,
      "{{ACT_TIME}}": actTime,
      "{{VEHICLE_MAKE}}": vehicle.make || "—",
      "{{VEHICLE_MODEL}}": vehicle.model || "—",
      "{{VEHICLE_PLATE}}": vehicle.plate_number || "—",
      "{{VEHICLE_VIN}}": vehicle.vin || "—",
      "{{DRIVER_FULL_NAME}}": `${driver.first_name} ${driver.last_name}`.trim(),
      "{{DRIVER_PHONE}}": driver.phone || "—",
    };

    const templateFileName =
      actType === "issue"
        ? "vehicle_handover_act_template.docx"
        : "vehicle_return_act_template.docx";

    const templatePath = path.join(
      process.cwd(),
      "contract-templates",
      templateFileName
    );

    if (!fs.existsSync(templatePath)) {
      return NextResponse.json(
        { error: "Шаблон акта не найден на сервере." },
        { status: 500 }
      );
    }

    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "act-"));
    const templateCopy = path.join(workDir, "template.docx");
    fs.copyFileSync(templatePath, templateCopy);

    const unpackedDir = path.join(workDir, "unpacked");
    execFileSync("unzip", ["-q", templateCopy, "-d", unpackedDir]);

    const docXmlPath = path.join(unpackedDir, "word", "document.xml");
    let xml = fs.readFileSync(docXmlPath, "utf-8");

    for (const [token, value] of Object.entries(replacements)) {
      xml = xml.split(token).join(escapeXml(value));
    }

    fs.writeFileSync(docXmlPath, xml, "utf-8");

    const outputPath = path.join(workDir, "output.docx");
    execFileSync("zip", ["-X", "-r", outputPath, "."], { cwd: unpackedDir });

    const fileBuffer = fs.readFileSync(outputPath);

    const safePlate = (vehicle.plate_number || "akt").replace(
      /[^a-zA-Z0-9-]/g,
      "_"
    );
    const actLabel = actType === "issue" ? "vydachi" : "vozvrata";
    const fileName = `akt_${actLabel}_${safePlate}_${actDate.replace(
      /\./g,
      "-"
    )}.docx`;

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (err) {
    console.error("ACT GENERATION ERROR:", err);
    return NextResponse.json(
      { error: "Не удалось сформировать акт." },
      { status: 500 }
    );
  } finally {
    if (workDir) {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  }
}
