import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL!;

const publishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

const secretKey =
  process.env.SUPABASE_SECRET_KEY!;

const admin = createClient(
  supabaseUrl,
  secretKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

const allowedRoles = [
  "administrator",
  "rental_manager",
  "service_manager",
  "vehicle_owner",
];

async function getRequester(request: NextRequest) {
  const authHeader =
    request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token =
    authHeader.replace("Bearer ", "");

  const authClient = createClient(
    supabaseUrl,
    publishableKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  const {
    data: { user },
    error,
  } = await authClient.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("role, active")
    .eq("id", user.id)
    .single();

  if (
    !profile ||
    !profile.active ||
    profile.role !== "director"
  ) {
    return null;
  }

  return {
    user,
    profile,
  };
}

function authEmailToLogin(email: string | null) {
  if (!email) return "";

  if (email.endsWith("@meduza.local")) {
    return email.replace("@meduza.local", "");
  }

  return email;
}

function loginToEmail(login: string) {
  const clean =
    login.trim().toLowerCase();

  return clean.includes("@")
    ? clean
    : `${clean}@meduza.local`;
}

/* ============================
   GET — ЗАГРУЗКА ПОЛЬЗОВАТЕЛЯ
============================ */

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  try {
    const requester =
      await getRequester(request);

    if (!requester) {
      return NextResponse.json(
        { error: "Недостаточно прав." },
        { status: 403 }
      );
    }

    const { id } = await context.params;

    // Director через эту карточку не редактируем
    const { data: profile, error: profileError } =
      await admin
        .from("profiles")
        .select(
          "id, full_name, phone, role, active"
        )
        .eq("id", id)
        .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "Пользователь не найден." },
        { status: 404 }
      );
    }

    if (profile.role === "director") {
      return NextResponse.json(
        {
          error:
            "Карточка Director недоступна для редактирования.",
        },
        { status: 403 }
      );
    }

    const {
      data: authData,
      error: authError,
    } = await admin.auth.admin.getUserById(id);

    if (authError || !authData.user) {
      return NextResponse.json(
        {
          error:
            "Не удалось получить данные авторизации.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      user: {
        id: profile.id,
        fullName: profile.full_name || "",
        phone: profile.phone || "",
        login: authEmailToLogin(
          authData.user.email || null
        ),
        role: profile.role,
        active: profile.active,
      },
    });
  } catch (error) {
    console.error("GET USER ERROR:", error);

    return NextResponse.json(
      { error: "Внутренняя ошибка сервера." },
      { status: 500 }
    );
  }
}

/* ============================
   PATCH — СОХРАНЕНИЕ
============================ */

export async function PATCH(
  request: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  try {
    const requester =
      await getRequester(request);

    if (!requester) {
      return NextResponse.json(
        { error: "Недостаточно прав." },
        { status: 403 }
      );
    }

    const { id } = await context.params;

    // Нельзя редактировать самого себя
    if (requester.user.id === id) {
      return NextResponse.json(
        {
          error:
            "Текущий пользователь не может редактировать себя здесь.",
        },
        { status: 403 }
      );
    }

    const { data: existingProfile } =
      await admin
        .from("profiles")
        .select("role")
        .eq("id", id)
        .single();

    if (!existingProfile) {
      return NextResponse.json(
        { error: "Пользователь не найден." },
        { status: 404 }
      );
    }

    // Director защищён
    if (existingProfile.role === "director") {
      return NextResponse.json(
        {
          error:
            "Director нельзя изменять через интерфейс.",
        },
        { status: 403 }
      );
    }

    const body = await request.json();

    const fullName =
      String(body.fullName || "").trim();

    const phone =
      String(body.phone || "").trim();

    const login =
      String(body.login || "")
        .trim()
        .toLowerCase();

    const newPassword =
      String(body.newPassword || "");

    const role =
      String(body.role || "");

    const active =
      body.active !== false;

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

    if (
      newPassword &&
      newPassword.length < 6
    ) {
      return NextResponse.json(
        {
          error:
            "Новый пароль должен содержать минимум 6 символов.",
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

    const email =
      loginToEmail(login);

    const authUpdate: {
      email: string;
      password?: string;
      email_confirm?: boolean;
    } = {
      email,
      email_confirm: true,
    };

    if (newPassword) {
      authUpdate.password =
        newPassword;
    }

    // Сначала обновляем Auth
    const {
      error: authUpdateError,
    } =
      await admin.auth.admin.updateUserById(
        id,
        authUpdate
      );

    if (authUpdateError) {
      let message =
        authUpdateError.message;

      if (
        message
          .toLowerCase()
          .includes("already")
      ) {
        message =
          "Пользователь с таким логином уже существует.";
      }

      return NextResponse.json(
        { error: message },
        { status: 400 }
      );
    }

    // Затем профиль
    const {
      data: updatedProfile,
      error: profileUpdateError,
    } = await admin
      .from("profiles")
      .update({
        full_name: fullName,
        phone: phone || null,
        role,
        active,
      })
      .eq("id", id)
      .select(
        "id, full_name, phone, role, active"
      )
      .single();

    if (
      profileUpdateError ||
      !updatedProfile
    ) {
      return NextResponse.json(
        {
          error:
            "Данные авторизации изменены, но профиль обновить не удалось.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,

      user: {
        id: updatedProfile.id,
        fullName:
          updatedProfile.full_name || "",
        phone:
          updatedProfile.phone || "",
        login,
        role:
          updatedProfile.role,
        active:
          updatedProfile.active,
      },
    });
  } catch (error) {
    console.error(
      "UPDATE USER ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Внутренняя ошибка сервера.",
      },
      { status: 500 }
    );
  }
}