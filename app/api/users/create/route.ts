import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const secretKey = process.env.SUPABASE_SECRET_KEY!;

const admin = createClient(supabaseUrl, secretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const allowedRoles = [
  "administrator",
  "rental_manager",
  "service_manager",
  "vehicle_owner",
  "warehouse_keeper",
];

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Нет авторизации." },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    const authClient = createClient(supabaseUrl, publishableKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const {
      data: { user: requester },
      error: requesterError,
    } = await authClient.auth.getUser(token);

    if (requesterError || !requester) {
      return NextResponse.json(
        { error: "Сессия недействительна." },
        { status: 401 }
      );
    }

    const { data: requesterProfile, error: profileError } =
      await admin
        .from("profiles")
        .select("role, active")
        .eq("id", requester.id)
        .single();

    if (
      profileError ||
      !requesterProfile ||
      !requesterProfile.active ||
      requesterProfile.role !== "director"
    ) {
      return NextResponse.json(
        { error: "Недостаточно прав." },
        { status: 403 }
      );
    }

    const body = await request.json();

    const fullName = String(body.fullName || "").trim();
    const phone = String(body.phone || "").trim();
    const login = String(body.login || "")
      .trim()
      .toLowerCase();
    const password = String(body.password || "");
    const role = String(body.role || "");
    const active = body.active !== false;

    if (!fullName) {
      return NextResponse.json(
        { error: "Укажите имя." },
        { status: 400 }
      );
    }

    if (!login) {
      return NextResponse.json(
        { error: "Укажите логин или Email." },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        {
          error:
            "Пароль должен содержать минимум 6 символов.",
        },
        { status: 400 }
      );
    }

    if (!allowedRoles.includes(role)) {
      return NextResponse.json(
        { error: "Недопустимая роль." },
        { status: 400 }
      );
    }

    const email = login.includes("@")
      ? login
      : `${login}@meduza.local`;

    const { data: createdUser, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (createError || !createdUser.user) {
      let message =
        createError?.message ||
        "Ошибка создания пользователя.";

      if (
        message.toLowerCase().includes("already") ||
        message.toLowerCase().includes("registered")
      ) {
        message =
          "Пользователь с таким логином уже существует.";
      }

      return NextResponse.json(
        { error: message },
        { status: 400 }
      );
    }

    const userId = createdUser.user.id;

    const { error: insertError } = await admin
      .from("profiles")
      .insert({
        id: userId,
        full_name: fullName,
        phone: phone || null,
        role,
        active,
      });

    if (insertError) {
      await admin.auth.admin.deleteUser(userId);

      return NextResponse.json(
        {
          error: `Не удалось создать профиль: ${insertError.message}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      userId,
    });
  } catch (error) {
    console.error("CREATE USER ERROR:", error);

    return NextResponse.json(
      { error: "Внутренняя ошибка сервера." },
      { status: 500 }
    );
  }
}