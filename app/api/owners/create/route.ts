import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

    const supabaseSecretKey =
      process.env.SUPABASE_SECRET_KEY?.trim();

    if (!supabaseUrl) {
      return NextResponse.json(
        {
          error:
            "На сервере не найден NEXT_PUBLIC_SUPABASE_URL.",
        },
        { status: 500 }
      );
    }

    if (!supabaseSecretKey) {
      return NextResponse.json(
        {
          error:
            "На сервере не найден SUPABASE_SECRET_KEY.",
        },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(
      supabaseUrl,
      supabaseSecretKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      }
    );

    const authHeader =
      request.headers.get("authorization");

    if (!authHeader) {
      return NextResponse.json(
        {
          error: "Заголовок авторизации отсутствует.",
        },
        { status: 401 }
      );
    }

    if (!authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        {
          error: "Неверный формат авторизации.",
        },
        { status: 401 }
      );
    }

    const accessToken = authHeader
      .substring(7)
      .trim();

    if (!accessToken) {
      return NextResponse.json(
        {
          error: "Токен авторизации пустой.",
        },
        { status: 401 }
      );
    }

    // 1. Проверяем пользователя по токену
    const {
      data: userData,
      error: userError,
    } = await supabaseAdmin.auth.getUser(
      accessToken
    );

    if (userError) {
      return NextResponse.json(
        {
          error:
            "Ошибка проверки пользователя: " +
            userError.message,
        },
        { status: 401 }
      );
    }

    const requester =
      userData.user;

    if (!requester) {
      return NextResponse.json(
        {
          error:
            "Пользователь по токену не найден.",
        },
        { status: 401 }
      );
    }

    // 2. Получаем профиль напрямую
    const {
      data: requesterProfile,
      error: requesterProfileError,
    } = await supabaseAdmin
      .from("profiles")
      .select("id, role, active, full_name")
      .eq("id", requester.id)
      .maybeSingle();

    if (requesterProfileError) {
      return NextResponse.json(
        {
          error:
            "Ошибка чтения профиля: " +
            requesterProfileError.message,
        },
        { status: 500 }
      );
    }

    if (!requesterProfile) {
      return NextResponse.json(
        {
          error:
            "Профиль текущего пользователя не найден. " +
            "UID: " +
            requester.id,
        },
        { status: 403 }
      );
    }

    if (!requesterProfile.active) {
      return NextResponse.json(
        {
          error:
            "Учетная запись пользователя отключена.",
        },
        { status: 403 }
      );
    }

    const allowedRoles = [
      "director",
      "administrator",
    ];

    if (
      !allowedRoles.includes(
        requesterProfile.role
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Недостаточно прав. Текущая роль: " +
            requesterProfile.role,
        },
        { status: 403 }
      );
    }

    // 3. Получаем данные формы
    const body =
      await request.json();

    const {
      ownerType,
      firstName,
      lastName,
      nip,
      phone,
      email,
      login,
      password,
      notes,
    } = body;

    if (!firstName?.trim()) {
      return NextResponse.json(
        {
          error:
            "Введите имя собственника.",
        },
        { status: 400 }
      );
    }

    if (
      ownerType === "person" &&
      !lastName?.trim()
    ) {
      return NextResponse.json(
        {
          error:
            "Введите фамилию собственника.",
        },
        { status: 400 }
      );
    }

    if (!login?.trim()) {
      return NextResponse.json(
        {
          error:
            "Введите логин.",
        },
        { status: 400 }
      );
    }

    if (
      !password ||
      password.length < 6
    ) {
      return NextResponse.json(
        {
          error:
            "Пароль должен содержать минимум 6 символов.",
        },
        { status: 400 }
      );
    }

    const cleanLogin = login
      .trim()
      .toLowerCase()
      .replace(
        /[^a-z0-9._-]/g,
        ""
      );

    if (!cleanLogin) {
      return NextResponse.json(
        {
          error:
            "Некорректный логин.",
        },
        { status: 400 }
      );
    }

    const authEmail =
      `${cleanLogin}@meduza.local`;

    const fullName =
      ownerType === "company"
        ? firstName.trim()
        : `${firstName.trim()} ${lastName.trim()}`.trim();

    // 4. Создаём пользователя кабинета
    const {
      data: createdUserData,
      error: createUserError,
    } =
      await supabaseAdmin.auth.admin.createUser({
        email: authEmail,
        password,
        email_confirm: true,

        user_metadata: {
          login: cleanLogin,
          full_name: fullName,
          role: "vehicle_owner",
        },
      });

    if (createUserError) {
      return NextResponse.json(
        {
          error:
            "Ошибка создания личного кабинета: " +
            createUserError.message,
        },
        { status: 400 }
      );
    }

    const portalUserId =
      createdUserData.user.id;

    // 5. Создаём профиль собственника
    const {
      error: createProfileError,
    } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: portalUserId,
        role: "vehicle_owner",
        full_name: fullName,
        phone:
          phone?.trim() || null,
        active: true,
      });

    if (createProfileError) {
      await supabaseAdmin.auth.admin.deleteUser(
        portalUserId
      );

      return NextResponse.json(
        {
          error:
            "Ошибка создания профиля собственника: " +
            createProfileError.message,
        },
        { status: 400 }
      );
    }

    // 6. Создаём карточку собственника
    const {
      data: ownerData,
      error: createOwnerError,
    } = await supabaseAdmin
      .from("vehicle_owners")
      .insert({
        owner_type:
          ownerType || "person",

        name:
          fullName,

        nip:
          ownerType === "company"
            ? nip?.trim() || null
            : null,

        phone:
          phone?.trim() || null,

        email:
          email?.trim() || null,

        notes:
          notes?.trim() || null,

        portal_user_id:
          portalUserId,
      })
      .select("id")
      .single();

    if (createOwnerError) {
      await supabaseAdmin
        .from("profiles")
        .delete()
        .eq(
          "id",
          portalUserId
        );

      await supabaseAdmin.auth.admin.deleteUser(
        portalUserId
      );

      return NextResponse.json(
        {
          error:
            "Ошибка создания собственника: " +
            createOwnerError.message,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      ownerId:
        ownerData.id,
      login:
        cleanLogin,
    });
  } catch (error) {
    console.error(
      "CREATE OWNER ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Внутренняя ошибка сервера.",
      },
      { status: 500 }
    );
  }
}