import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

// ---------- Число прописью (польский, для суммы в договоре) ----------

const ONES = [
  "zero", "jeden", "dwa", "trzy", "cztery",
  "pięć", "sześć", "siedem", "osiem", "dziewięć",
];

const TEENS = [
  "dziesięć", "jedenaście", "dwanaście", "trzynaście", "czternaście",
  "piętnaście", "szesnaście", "siedemnaście", "osiemnaście", "dziewiętnaście",
];

const TENS = [
  "", "", "dwadzieścia", "trzydzieści", "czterdzieści",
  "pięćdziesiąt", "sześćdziesiąt", "siedemdziesiąt", "osiemdziesiąt", "dziewięćdziesiąt",
];

const HUNDREDS = [
  "", "sto", "dwieście", "trzysta", "czterysta",
  "pięćset", "sześćset", "siedemset", "osiemset", "dziewięćset",
];

function threeDigitsToWords(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rem = n % 100;

  if (h > 0) parts.push(HUNDREDS[h]);

  if (rem >= 10 && rem < 20) {
    parts.push(TEENS[rem - 10]);
  } else {
    const t = Math.floor(rem / 10);
    const o = rem % 10;
    if (t > 0) parts.push(TENS[t]);
    if (o > 0) parts.push(ONES[o]);
  }

  return parts.join(" ");
}

function pluralForm(n: number, forms: [string, string, string]): string {
  const n100 = n % 100;
  const n10 = n % 10;

  if (n === 1) return forms[0];
  if (n10 >= 2 && n10 <= 4 && !(n100 >= 12 && n100 <= 14)) return forms[1];
  return forms[2];
}

function integerToWords(n: number): string {
  if (n === 0) return "zero";

  const parts: string[] = [];
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;

  if (thousands > 0) {
    if (thousands === 1) {
      parts.push("tysiąc");
    } else {
      parts.push(threeDigitsToWords(thousands));
      parts.push(pluralForm(thousands, ["tysiąc", "tysiące", "tysięcy"]));
    }
  }

  if (rest > 0) {
    parts.push(threeDigitsToWords(rest));
  }

  return parts.join(" ").trim();
}

function zlotyForm(n: number): string {
  return pluralForm(n, ["złoty", "złote", "złotych"]);
}

function groszForm(n: number): string {
  return pluralForm(n, ["grosz", "grosze", "groszy"]);
}

// "700 (siedemset) złotych" / "704 (siedemset cztery) złote" /
// "650,50 (sześćset pięćdziesiąt złotych pięćdziesiąt groszy)"
function weeklyPricePhrase(amount: number): string {
  const zloty = Math.floor(amount);
  const grosz = Math.round((amount - zloty) * 100);

  const zlotyWords = integerToWords(zloty);
  const zlotyLabel = zlotyForm(zloty);

  if (grosz > 0) {
    const groszWords = integerToWords(grosz);
    const groszLabel = groszForm(grosz);
    const numeral = `${zloty},${String(grosz).padStart(2, "0")}`;
    return `${numeral} (${zlotyWords} ${zlotyLabel} ${groszWords} ${groszLabel})`;
  }

  return `${zloty} (${zlotyWords}) ${zlotyLabel}`;
}

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

// Дописывает содержимое акта приёма-передачи как отдельный раздел (с
// новой страницы, со своим размером страницы) в конец уже заполненного
// document.xml договора. Стиль акта "No Spacing" переименовывается в
// уникальный ID, чтобы не столкнуться с другим стилем с тем же ID в
// styles.xml договора (в разных docx одинаковые ID могут означать разные
// стили).
function appendActSection(
  unpackedDir: string,
  actTemplatePath: string,
  actReplacements: Record<string, string>
) {
  const actUnpackDir = path.join(unpackedDir, "..", "act_unpacked");
  execFileSync("unzip", ["-q", actTemplatePath, "-d", actUnpackDir]);

  const actDocXmlPath = path.join(actUnpackDir, "word", "document.xml");
  let actXml = fs.readFileSync(actDocXmlPath, "utf-8");

  for (const [token, value] of Object.entries(actReplacements)) {
    actXml = actXml.split(token).join(escapeXml(value));
  }

  // Разные ID стилей в разных файлах могут означать разное — переименовываем.
  actXml = actXml.split('w:pStyle w:val="a3"').join(
    'w:pStyle w:val="actNoSpacing"'
  );

  const contractDocXmlPath = path.join(unpackedDir, "word", "document.xml");
  const contractXml = fs.readFileSync(contractDocXmlPath, "utf-8");

  const contractSectPrMatch = contractXml.match(
    /(<w:sectPr\b[\s\S]*?<\/w:sectPr>)<\/w:body><\/w:document>\s*$/
  );
  if (!contractSectPrMatch) {
    throw new Error("Не удалось найти секцию договора для склейки с актом.");
  }
  const contractSectPr = contractSectPrMatch[1];
  const contractBodyWithoutSectPr = contractXml.slice(
    0,
    contractSectPrMatch.index
  );

  const actBodyMatch = actXml.match(/<w:body>([\s\S]*)<\/w:body><\/w:document>\s*$/);
  if (!actBodyMatch) {
    throw new Error("Не удалось прочитать содержимое акта.");
  }
  const actBodyInner = actBodyMatch[1];

  const actSectPrMatch = actBodyInner.match(/(<w:sectPr\b[\s\S]*?<\/w:sectPr>)$/);
  if (!actSectPrMatch) {
    throw new Error("Не удалось найти секцию акта.");
  }
  const actSectPr = actSectPrMatch[1];
  const actParagraphs = actBodyInner.slice(0, actSectPrMatch.index);

  // Параграф-разрыв раздела: несёт свойства ПЕРВОГО раздела (договора),
  // после него начинается второй раздел (акт) со своими полями/размером.
  const sectionBreakParagraph = `<w:p><w:pPr>${contractSectPr}</w:pPr></w:p>`;

  const mergedXml =
    contractBodyWithoutSectPr +
    sectionBreakParagraph +
    actParagraphs +
    actSectPr +
    "</w:body></w:document>";

  fs.writeFileSync(contractDocXmlPath, mergedXml, "utf-8");

  const stylesPath = path.join(unpackedDir, "word", "styles.xml");
  let stylesXml = fs.readFileSync(stylesPath, "utf-8");
  const noSpacingStyle =
    '<w:style w:type="paragraph" w:styleId="actNoSpacing">' +
    '<w:name w:val="Act No Spacing"/>' +
    '<w:uiPriority w:val="1"/>' +
    '<w:qFormat/>' +
    '<w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>' +
    "</w:style>";
  stylesXml = stylesXml.replace("</w:styles>", noSpacingStyle + "</w:styles>");
  fs.writeFileSync(stylesPath, stylesXml, "utf-8");

  fs.rmSync(actUnpackDir, { recursive: true, force: true });
}

// ---------- Обработчик ----------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let workDir = "";

  try {
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
      .select("id, weekly_price, started_at, vehicle_id, driver_id")
      .eq("id", rentalId)
      .single();

    if (rentalError || !rental) {
      return NextResponse.json(
        { error: "Аренда не найдена." },
        { status: 404 }
      );
    }

    const { data: vehicle } = await supabase
      .from("vehicles")
      .select("make, model, vin, plate_number")
      .eq("id", rental.vehicle_id)
      .single();

    const { data: driver } = await supabase
      .from("drivers")
      .select(
        "last_name, first_name, passport_number, driving_license_number, pesel, residence_card_number, postal_code, city, street, house_number, apartment_number, phone"
      )
      .eq("id", rental.driver_id)
      .single();

    if (!vehicle || !driver) {
      return NextResponse.json(
        { error: "Не удалось загрузить данные автомобиля или водителя." },
        { status: 404 }
      );
    }

    const started = new Date(rental.started_at);
    const contractDate = `${pad2(started.getDate())}.${pad2(
      started.getMonth() + 1
    )}.${started.getFullYear()}`;
    const contractTime = `${pad2(started.getHours())}:${pad2(
      started.getMinutes()
    )}`;

    const streetLine =
      driver.street && driver.house_number
        ? `ul. ${driver.street} ${driver.house_number}${
            driver.apartment_number ? "/" + driver.apartment_number : ""
          }`
        : "";

    const cityLine =
      driver.postal_code && driver.city
        ? `${driver.postal_code} ${driver.city}`
        : "";

    const driverAddress = [streetLine, cityLine].filter(Boolean).join(", ");
    const driverFullName = `${driver.first_name} ${driver.last_name}`.trim();

    const contractReplacements: Record<string, string> = {
      "{{CONTRACT_DATE}}": contractDate,
      "{{CONTRACT_TIME}}": contractTime,
      "{{DRIVER_FULL_NAME}}": driverFullName,
      "{{DRIVER_ADDRESS}}": driverAddress || "—",
      "{{DRIVER_PESEL}}": driver.pesel || driver.residence_card_number || "—",
      "{{DRIVER_PASSPORT}}": driver.passport_number || "—",
      "{{DRIVER_LICENSE}}": driver.driving_license_number || "—",
      "{{DRIVER_PHONE}}": driver.phone || "—",
      "{{VEHICLE_MAKE}}": vehicle.make || "—",
      "{{VEHICLE_MODEL}}": vehicle.model || "—",
      "{{VEHICLE_VIN}}": vehicle.vin || "—",
      "{{VEHICLE_PLATE}}": vehicle.plate_number || "—",
      "{{WEEKLY_PRICE_PHRASE}}": weeklyPricePhrase(
        Number(rental.weekly_price) || 0
      ),
    };

    const actReplacements: Record<string, string> = {
      "{{ACT_DATE}}": contractDate,
      "{{ACT_TIME}}": contractTime,
      "{{VEHICLE_MAKE}}": vehicle.make || "—",
      "{{VEHICLE_MODEL}}": vehicle.model || "—",
      "{{VEHICLE_PLATE}}": vehicle.plate_number || "—",
      "{{VEHICLE_VIN}}": vehicle.vin || "—",
      "{{DRIVER_FULL_NAME}}": driverFullName,
      "{{DRIVER_PHONE}}": driver.phone || "—",
    };

    const templatePath = path.join(
      process.cwd(),
      "contract-templates",
      "rental_contract_template.docx"
    );

    const actTemplatePath = path.join(
      process.cwd(),
      "contract-templates",
      "vehicle_handover_act_template.docx"
    );

    if (!fs.existsSync(templatePath)) {
      return NextResponse.json(
        { error: "Шаблон договора не найден на сервере." },
        { status: 500 }
      );
    }

    if (!fs.existsSync(actTemplatePath)) {
      return NextResponse.json(
        { error: "Шаблон акта приёма-передачи не найден на сервере." },
        { status: 500 }
      );
    }

    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "contract-"));
    const templateCopy = path.join(workDir, "template.docx");
    fs.copyFileSync(templatePath, templateCopy);

    const unpackedDir = path.join(workDir, "unpacked");
    execFileSync("unzip", ["-q", templateCopy, "-d", unpackedDir]);

    const docXmlPath = path.join(unpackedDir, "word", "document.xml");
    let xml = fs.readFileSync(docXmlPath, "utf-8");

    for (const [token, value] of Object.entries(contractReplacements)) {
      xml = xml.split(token).join(escapeXml(value));
    }

    fs.writeFileSync(docXmlPath, xml, "utf-8");

    appendActSection(unpackedDir, actTemplatePath, actReplacements);

    const outputPath = path.join(workDir, "output.docx");
    execFileSync("zip", ["-X", "-r", outputPath, "."], { cwd: unpackedDir });

    const fileBuffer = fs.readFileSync(outputPath);

    const safePlate = (vehicle.plate_number || "dogovor").replace(
      /[^a-zA-Z0-9-]/g,
      "_"
    );
    const fileName = `dogovor_i_akt_${safePlate}_${contractDate.replace(
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
    console.error("CONTRACT GENERATION ERROR:", err);
    return NextResponse.json(
      { error: "Не удалось сформировать договор." },
      { status: 500 }
    );
  } finally {
    if (workDir) {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  }
}
