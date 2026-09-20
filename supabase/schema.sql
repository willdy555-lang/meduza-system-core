create extension if not exists pgcrypto;

create type public.user_role as enum (
  'director',
  'administrator',
  'manager',
  'mechanic',
  'driver',
  'vehicle_owner'
);

create type public.vehicle_status as enum (
  'free',
  'working',
  'service',
  'accident',
  'blocked',
  'inactive'
);

create type public.cooperation_type as enum (
  'owned',
  'managed',
  'rented',
  'other'
);

create type public.task_status as enum (
  'new',
  'in_progress',
  'done',
  'cancelled'
);

create type public.task_priority as enum (
  'low',
  'normal',
  'high',
  'critical'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null,
  full_name text not null,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.vehicle_owners (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null default 'person',
  name text not null,
  nip text,
  phone text,
  email text,
  notes text,
  portal_user_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create sequence if not exists public.vehicle_code_seq start 1;

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  internal_code text unique not null default
    ('CAR-' || lpad(nextval('public.vehicle_code_seq')::text, 6, '0')),
  plate_number text not null,
  vin text not null,
  make text not null,
  model text not null,
  production_year integer,
  fuel_type text,
  owner_id uuid references public.vehicle_owners(id),
  cooperation_type public.cooperation_type not null default 'managed',
  current_driver_id uuid references public.profiles(id),
  current_mileage integer not null default 0 check (current_mileage >= 0),
  status public.vehicle_status not null default 'free',
  main_photo_path text,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create unique index vehicles_vin_unique_active
  on public.vehicles(lower(vin))
  where archived_at is null;

create index vehicles_plate_idx on public.vehicles(lower(plate_number));
create index vehicles_owner_idx on public.vehicles(owner_id);
create index vehicles_driver_idx on public.vehicles(current_driver_id);

create table public.mileage_entries (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  mileage integer not null check (mileage >= 0),
  recorded_at timestamptz not null default now(),
  entered_by uuid references public.profiles(id),
  source text,
  odometer_photo_path text,
  note text,
  created_at timestamptz not null default now()
);

create index mileage_vehicle_date_idx
  on public.mileage_entries(vehicle_id, recorded_at desc);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  document_type text not null,
  document_number text,
  valid_from date,
  valid_until date,
  expiry_control boolean not null default false,
  file_path text,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index documents_entity_idx
  on public.documents(entity_type, entity_id);

create index documents_expiry_idx
  on public.documents(valid_until)
  where expiry_control = true;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  related_entity_type text,
  related_entity_id uuid,
  assigned_to uuid references public.profiles(id),
  due_at timestamptz,
  priority public.task_priority not null default 'normal',
  status public.task_status not null default 'new',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  channel text not null default 'sms',
  body_template text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.notification_templates(id),
  recipient_type text,
  recipient_id uuid,
  destination text not null,
  channel text not null,
  body text not null,
  status text not null default 'queued',
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.vehicle_events (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  event_type text not null,
  title text not null,
  description text,
  actor_id uuid references public.profiles(id),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index vehicle_events_vehicle_idx
  on public.vehicle_events(vehicle_id, created_at desc);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index audit_entity_idx
  on public.audit_log(entity_type, entity_id, created_at desc);

-- Базовая защита: RLS включаем сразу.
alter table public.profiles enable row level security;
alter table public.vehicle_owners enable row level security;
alter table public.vehicles enable row level security;
alter table public.mileage_entries enable row level security;
alter table public.documents enable row level security;
alter table public.tasks enable row level security;
alter table public.notification_templates enable row level security;
alter table public.notification_log enable row level security;
alter table public.vehicle_events enable row level security;
alter table public.audit_log enable row level security;

-- ВАЖНО:
-- Политики доступа намеренно не открываем "для всех".
-- На следующем этапе настроим права по ролям.

-- =====================================================================
-- RENT MODULE — rentals + deposit ledger
-- Добавлено при продолжении работы над /rent/new (компактные селекторы).
--
-- ВАЖНО ПЕРЕД ВЫПОЛНЕНИЕМ:
-- Эта миграция написана по коду app/drivers/*, где таблица "drivers"
-- используется как отдельная сущность (id, last_name, first_name, ...).
-- В этом файле schema.sql таблицы "drivers" нет — судя по всему, она
-- была создана позже прямо в Supabase и в schema.sql не попала.
-- rentals.driver_id ниже ссылается на public.drivers(id) и предполагает,
-- что id там uuid (как везде в проекте). Если в реальной базе drivers.id
-- другого типа или таблица называется иначе — поправьте FK ниже перед
-- выполнением.
--
-- Решение по модели депозита: журнал операций (deposit_transactions),
-- а не одно число на аренде — так требование "получено / возвращено /
-- остаток / кто и когда вернул / частичные возвраты" реализуется без
-- пересборки схемы, когда появится экран возврата депозита.
-- =====================================================================

create type public.rental_status as enum (
  'active',
  'completed',
  'cancelled'
);

create type public.deposit_transaction_type as enum (
  'received',
  'returned'
);

create table public.rentals (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id),
  driver_id uuid not null references public.drivers(id),
  started_at timestamptz not null,
  ended_at timestamptz,
  weekly_price numeric(10, 2) not null check (weekly_price > 0),
  status public.rental_status not null default 'active',
  final_amount numeric(10, 2),
  contract_file_path text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Один автомобиль — одна активная аренда одновременно (защита от
-- случайного назначения двух водителей). Когда появится настройка
-- «Разрешить несколько активных водителей» на автомобиле — этот индекс
-- нужно будет пересмотреть под конкретные машины с этим флагом.
create unique index rentals_vehicle_active_unique
  on public.rentals(vehicle_id)
  where status = 'active';

-- Один водитель — одна активная аренда одновременно.
create unique index rentals_driver_active_unique
  on public.rentals(driver_id)
  where status = 'active';

create index rentals_vehicle_idx on public.rentals(vehicle_id, created_at desc);
create index rentals_driver_idx on public.rentals(driver_id, created_at desc);
create index rentals_status_idx on public.rentals(status);

create table public.deposit_transactions (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references public.rentals(id) on delete cascade,
  type public.deposit_transaction_type not null,
  amount numeric(10, 2) not null check (amount > 0),
  occurred_at timestamptz not null default now(),
  actor_id uuid references public.profiles(id),
  note text,
  created_at timestamptz not null default now()
);

create index deposit_transactions_rental_idx
  on public.deposit_transactions(rental_id, occurred_at);

alter table public.rentals enable row level security;
alter table public.deposit_transactions enable row level security;

-- Политики доступа для rentals / deposit_transactions настроим вместе
-- с остальными таблицами на этапе ролей и RLS.
