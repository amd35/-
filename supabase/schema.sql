-- مخطط قاعدة بيانات تطبيق "غرفة الأصدقاء" على Supabase.
-- الخطوات: أنشئ مشروعاً على supabase.com ← SQL Editor ← New query ← الصق هذا الملف ← Run.
-- الملف قابل للتشغيل أكثر من مرة بأمان.

create extension if not exists pgcrypto;

-- الغرف
create table if not exists public.rooms (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  host       text        not null default 'بدون مضيف',
  members    integer     not null default 0,
  status     text        not null default 'scheduled',
  date       date        not null default current_date,
  created_at timestamptz not null default now()
);

-- المهام
create table if not exists public.tasks (
  id         uuid        primary key default gen_random_uuid(),
  text       text        not null,
  done       boolean     not null default false,
  created_at timestamptz not null default now()
);

-- الملف الشخصي (سجل واحد)
create table if not exists public.app_profile (
  id           text primary key default 'default',
  name         text default 'أنت',
  email        text default '',
  bio          text default '',
  notify_email boolean not null default true,
  notify_tasks boolean not null default true
);

-- الإعدادات (سجل واحد)
create table if not exists public.app_settings (
  id           text primary key default 'default',
  space_name   text not null default 'غرفة الأصدقاء',
  notify_rooms boolean not null default true,
  notify_chat  boolean not null default true,
  auto_mute    boolean not null default false
);

-- سجل النشاط
create table if not exists public.activity_log (
  id         uuid        primary key default gen_random_uuid(),
  kind       text        not null default 'info',
  text       text        not null,
  created_at timestamptz not null default now()
);

-- رسائل صفحة اتصل بنا
create table if not exists public.contact_messages (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  email      text        default '',
  message    text        not null,
  created_at timestamptz not null default now()
);

-- حالة الأنظمة (٥٠ نظاماً)
create table if not exists public.app_systems (
  id         text        primary key,
  state      jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.app_profile (id) values ('default') on conflict (id) do nothing;
insert into public.app_settings (id) values ('default') on conflict (id) do nothing;

-- صلاحيات الواجهة بالمفتاح العام (anon)
grant usage on schema public to anon, authenticated;
grant all on public.rooms, public.tasks, public.app_profile, public.app_settings,
             public.activity_log, public.contact_messages, public.app_systems
  to anon, authenticated;

alter table public.rooms            enable row level security;
alter table public.tasks            enable row level security;
alter table public.app_profile      enable row level security;
alter table public.app_settings     enable row level security;
alter table public.activity_log     enable row level security;
alter table public.contact_messages enable row level security;
alter table public.app_systems      enable row level security;

drop policy if exists app_all on public.rooms;
create policy app_all on public.rooms for all to anon, authenticated using (true) with check (true);

drop policy if exists app_all on public.tasks;
create policy app_all on public.tasks for all to anon, authenticated using (true) with check (true);

drop policy if exists app_all on public.app_profile;
create policy app_all on public.app_profile for all to anon, authenticated using (true) with check (true);

drop policy if exists app_all on public.app_settings;
create policy app_all on public.app_settings for all to anon, authenticated using (true) with check (true);

drop policy if exists app_all on public.activity_log;
create policy app_all on public.activity_log for all to anon, authenticated using (true) with check (true);

drop policy if exists app_all on public.contact_messages;
create policy app_all on public.contact_messages for all to anon, authenticated using (true) with check (true);

drop policy if exists app_all on public.app_systems;
create policy app_all on public.app_systems for all to anon, authenticated using (true) with check (true);

-- تنبيه: هذه السياسات مفتوحة لمن يملك المفتاح العام (بدون تسجيل دخول).
-- مناسبة لمساحة عمل مشتركة، وأي تطبيق متعدد المستخدمين يحتاج سياسات حسب المستخدم.
