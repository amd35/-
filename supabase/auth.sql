-- طبقة الحسابات الحقيقية لتطبيق "صوت": تسجيل الدخول، الجلسات، الأصدقاء، الغرف والدردشة.
-- يُنفَّذ بعد supabase/schema.sql، وهو قابل للتشغيل أكثر من مرة بأمان.
-- كل المنطق الحسّاس داخل دوال security definer، ولا تُمنح صلاحية قراءة جدول الحسابات للواجهة.

create extension if not exists pgcrypto;

/* ---------- الحسابات ---------- */

create table if not exists public.app_users (
  id            uuid        primary key default gen_random_uuid(),
  name          text        not null,
  email         text,
  phone         text,
  password_hash text,
  method        text        not null default 'email',
  bio           text        not null default '',
  created_at    timestamptz not null default now(),
  last_seen     timestamptz not null default now()
);

create unique index if not exists app_users_email_key on public.app_users (lower(email)) where email is not null;
create unique index if not exists app_users_phone_key on public.app_users (phone) where phone is not null;

create table if not exists public.app_sessions (
  token      uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '60 days'
);

create index if not exists app_sessions_user_idx on public.app_sessions (user_id);

/* ---------- الأصدقاء ---------- */

create table if not exists public.app_friendships (
  id         uuid        primary key default gen_random_uuid(),
  requester  uuid        not null references public.app_users(id) on delete cascade,
  addressee  uuid        not null references public.app_users(id) on delete cascade,
  status     text        not null default 'pending',
  created_at timestamptz not null default now(),
  unique (requester, addressee)
);

/* ---------- الغرف الحقيقية والدردشة ---------- */

alter table public.rooms add column if not exists host_id uuid;
alter table public.rooms add column if not exists game    text    not null default 'voice';
alter table public.rooms add column if not exists seats   integer not null default 5;
alter table public.rooms add column if not exists topic   text    not null default '';

create table if not exists public.app_room_members (
  room_id   uuid        not null references public.rooms(id) on delete cascade,
  user_id   uuid        not null references public.app_users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.app_room_messages (
  id         uuid        primary key default gen_random_uuid(),
  room_id    uuid        not null references public.rooms(id) on delete cascade,
  user_id    uuid        references public.app_users(id) on delete set null,
  name       text        not null,
  text       text        not null,
  created_at timestamptz not null default now()
);

create index if not exists app_room_messages_room_idx on public.app_room_messages (room_id, created_at desc);

/* ---------- الألعاب ---------- */

create table if not exists public.app_games (
  id      text    primary key,
  name    text    not null,
  tagline text    not null default '',
  status  text    not null default 'soon',
  sort    integer not null default 10
);

insert into public.app_games (id, name, tagline, status, sort) values
  ('ludo',   'لودو',   'أربع قطع، طريق واحد إلى البيت', 'open', 1),
  ('domino', 'دومينو', 'سلسلة الأحجار — طاولات صوتية',     'open', 2)
on conflict (id) do nothing;

/* ---------- أدوات داخلية ---------- */

create or replace function public.app_user_json(u public.app_users)
returns json
language sql
stable
as $$
  select json_build_object(
    'id', u.id,
    'name', u.name,
    'email', u.email,
    'phone', u.phone,
    'method', u.method,
    'bio', coalesce(u.bio, ''),
    'created_at', u.created_at
  );
$$;

create or replace function public.app_uid(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  select s.user_id into v_user
  from public.app_sessions s
  where s.token = p_token and s.expires_at > now();
  if v_user is null then
    raise exception 'انتهت الجلسة — سجّل الدخول من جديد' using errcode = '28000';
  end if;
  return v_user;
end;
$$;

create or replace function public.app_start_session(p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
begin
  insert into public.app_sessions (user_id) values (p_user) returning token into v_token;
  update public.app_users set last_seen = now() where id = p_user;
  return v_token;
end;
$$;

/* ---------- التسجيل والدخول ---------- */

create or replace function public.app_signup(
  p_name     text,
  p_email    text default null,
  p_phone    text default null,
  p_password text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  public.app_users;
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), '');
  v_name  text := nullif(trim(coalesce(p_name, '')), '');
  v_token uuid;
begin
  if v_name is null then
    raise exception 'الاسم مطلوب' using errcode = '22023';
  end if;
  if v_email is null and v_phone is null then
    raise exception 'أدخل بريداً إلكترونياً أو رقم هاتف' using errcode = '22023';
  end if;
  if length(coalesce(p_password, '')) < 6 then
    raise exception 'كلمة المرور يجب أن تكون ٦ أحرف على الأقل' using errcode = '22023';
  end if;
  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'صيغة البريد الإلكتروني غير صحيحة' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.app_users u
    where (v_email is not null and lower(u.email) = v_email)
       or (v_phone is not null and u.phone = v_phone)
  ) then
    raise exception 'يوجد حساب مسجّل بهذه البيانات — سجّل الدخول' using errcode = '23505';
  end if;

  insert into public.app_users (name, email, phone, password_hash, method)
  values (
    v_name,
    v_email,
    v_phone,
    crypt(p_password, gen_salt('bf', 10)),
    case when v_email is not null then 'email' else 'phone' end
  )
  returning * into v_user;

  v_token := public.app_start_session(v_user.id);
  return json_build_object('token', v_token, 'user', public.app_user_json(v_user));
end;
$$;

create or replace function public.app_login(p_identifier text, p_password text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  public.app_users;
  v_id    text := trim(coalesce(p_identifier, ''));
  v_phone text := nullif(regexp_replace(coalesce(p_identifier, ''), '[^0-9+]', '', 'g'), '');
  v_token uuid;
begin
  if v_id = '' then
    raise exception 'أدخل بريدك أو رقم هاتفك' using errcode = '22023';
  end if;

  select * into v_user
  from public.app_users u
  where (u.email is not null and lower(u.email) = lower(v_id))
     or (v_phone is not null and u.phone = v_phone)
  limit 1;

  if v_user.id is null then
    raise exception 'لا يوجد حساب بهذه البيانات' using errcode = '28000';
  end if;
  if v_user.password_hash is null then
    raise exception 'هذا الحساب لا يستخدم كلمة مرور — ادخل كضيف' using errcode = '28000';
  end if;
  if crypt(coalesce(p_password, ''), v_user.password_hash) <> v_user.password_hash then
    raise exception 'كلمة المرور غير صحيحة' using errcode = '28P01';
  end if;

  v_token := public.app_start_session(v_user.id);
  return json_build_object('token', v_token, 'user', public.app_user_json(v_user));
end;
$$;

create or replace function public.app_guest(p_name text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  public.app_users;
  v_name  text := nullif(trim(coalesce(p_name, '')), '');
  v_token uuid;
begin
  if v_name is null then
    v_name := 'ضيف ' || substr(md5(random()::text), 1, 4);
  end if;

  insert into public.app_users (name, method)
  values (v_name, 'guest')
  returning * into v_user;

  v_token := public.app_start_session(v_user.id);
  return json_build_object('token', v_token, 'user', public.app_user_json(v_user));
end;
$$;

create or replace function public.app_session(p_token uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.app_users;
begin
  select u.* into v_user
  from public.app_sessions s
  join public.app_users u on u.id = s.user_id
  where s.token = p_token and s.expires_at > now();

  if v_user.id is null then
    raise exception 'انتهت الجلسة — سجّل الدخول من جديد' using errcode = '28000';
  end if;
  return json_build_object('token', p_token, 'user', public.app_user_json(v_user));
end;
$$;

create or replace function public.app_logout(p_token uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.app_sessions where token = p_token;
  return json_build_object('ok', true);
end;
$$;

create or replace function public.app_profile_save(p_token uuid, p_name text, p_bio text default '')
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.app_users;
begin
  perform public.app_uid(p_token);
  if nullif(trim(coalesce(p_name, '')), '') is null then
    raise exception 'الاسم مطلوب' using errcode = '22023';
  end if;
  update public.app_users
     set name = trim(p_name), bio = coalesce(p_bio, '')
   where id = public.app_uid(p_token)
  returning * into v_user;
  return public.app_user_json(v_user);
end;
$$;

/* ---------- الأصدقاء ---------- */

create or replace function public.app_friends(p_token uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me      uuid := public.app_uid(p_token);
  v_friends json;
  v_in      json;
  v_out     json;
begin
  select coalesce(json_agg(json_build_object(
           'id', u.id, 'name', u.name, 'method', u.method, 'since', f.created_at
         ) order by u.name), '[]'::json)
    into v_friends
  from public.app_friendships f
  join public.app_users u
    on u.id = case when f.requester = v_me then f.addressee else f.requester end
  where f.status = 'accepted' and (f.requester = v_me or f.addressee = v_me);

  select coalesce(json_agg(json_build_object(
           'friendship', f.id, 'id', u.id, 'name', u.name, 'method', u.method, 'at', f.created_at
         ) order by f.created_at desc), '[]'::json)
    into v_in
  from public.app_friendships f
  join public.app_users u on u.id = f.requester
  where f.addressee = v_me and f.status = 'pending';

  select coalesce(json_agg(json_build_object(
           'friendship', f.id, 'id', u.id, 'name', u.name, 'method', u.method, 'at', f.created_at
         ) order by f.created_at desc), '[]'::json)
    into v_out
  from public.app_friendships f
  join public.app_users u on u.id = f.addressee
  where f.requester = v_me and f.status = 'pending';

  return json_build_object('friends', v_friends, 'incoming', v_in, 'outgoing', v_out);
end;
$$;

create or replace function public.app_friend_search(p_token uuid, p_q text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.app_uid(p_token);
  v_q  text := trim(coalesce(p_q, ''));
begin
  if length(v_q) < 2 then
    return '[]'::json;
  end if;

  return coalesce((
    select json_agg(item order by item->>'name')
    from (
      select json_build_object(
        'id', u.id,
        'name', u.name,
        'method', u.method,
        'state', case
                   when f.status = 'accepted' then 'friend'
                   when f.status = 'pending' and f.requester = v_me then 'outgoing'
                   when f.status = 'pending' then 'incoming'
                   else 'none'
                 end
      ) as item
      from public.app_users u
      left join public.app_friendships f
        on (f.requester = v_me and f.addressee = u.id)
        or (f.addressee = v_me and f.requester = u.id)
      where u.id <> v_me
        and u.method <> 'guest'
        and (
          u.name ilike '%' || v_q || '%'
          or coalesce(u.email, '') ilike '%' || v_q || '%'
          or coalesce(u.phone, '') like '%' || regexp_replace(v_q, '[^0-9]', '', 'g') || '%'
        )
      order by u.name
      limit 20
    ) s
  ), '[]'::json);
end;
$$;

create or replace function public.app_friend_request(p_token uuid, p_user uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.app_uid(p_token);
begin
  if p_user = v_me then
    raise exception 'لا يمكنك إضافة نفسك' using errcode = '22023';
  end if;
  if not exists (select 1 from public.app_users where id = p_user) then
    raise exception 'الحساب غير موجود' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.app_friendships
    where (requester = v_me and addressee = p_user)
       or (requester = p_user and addressee = v_me)
  ) then
    raise exception 'توجد صداقة أو دعوة قائمة بهذا الحساب' using errcode = '23505';
  end if;

  insert into public.app_friendships (requester, addressee) values (v_me, p_user);
  return json_build_object('ok', true);
end;
$$;

create or replace function public.app_friend_respond(p_token uuid, p_friendship uuid, p_accept boolean)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.app_uid(p_token);
begin
  if p_accept then
    update public.app_friendships
       set status = 'accepted'
     where id = p_friendship and addressee = v_me and status = 'pending';
    if not found then
      raise exception 'الدعوة غير موجودة' using errcode = '22023';
    end if;
  else
    delete from public.app_friendships
     where id = p_friendship and addressee = v_me and status = 'pending';
  end if;
  return json_build_object('ok', true);
end;
$$;

create or replace function public.app_friend_remove(p_token uuid, p_user uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.app_uid(p_token);
begin
  delete from public.app_friendships
  where (requester = v_me and addressee = p_user)
     or (requester = p_user and addressee = v_me);
  return json_build_object('ok', true);
end;
$$;

/* ---------- الغرف ---------- */

create or replace function public.app_rooms(p_token uuid, p_game text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me   uuid := public.app_uid(p_token);
  v_game text := nullif(trim(coalesce(p_game, '')), '');
begin
  return coalesce((
    select json_agg(json_build_object(
             'id', r.id,
             'name', r.name,
             'topic', r.topic,
             'game', r.game,
             'seats', r.seats,
             'host', coalesce(u.name, r.host),
             'host_id', r.host_id,
             'members', (select count(*) from public.app_room_members m where m.room_id = r.id),
             'joined', exists (select 1 from public.app_room_members m where m.room_id = r.id and m.user_id = v_me),
             'status', r.status,
             'created_at', r.created_at
           ) order by r.created_at desc)
    from public.rooms r
    left join public.app_users u on u.id = r.host_id
    where r.host_id is not null
      and r.status = 'live'
      and (v_game is null or r.game = v_game)
      and (r.created_at > now() - interval '12 hours'
           or exists (select 1 from public.app_room_members m where m.room_id = r.id))
  ), '[]'::json);
end;
$$;

create or replace function public.app_room_create(
  p_token uuid,
  p_name  text,
  p_game  text default 'voice',
  p_seats integer default 5,
  p_topic text default ''
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me   uuid := public.app_uid(p_token);
  v_user public.app_users;
  v_room public.rooms;
  v_game text := coalesce(nullif(trim(p_game), ''), 'voice');
  v_seats integer := least(20, greatest(2, coalesce(p_seats, 5)));
begin
  select * into v_user from public.app_users where id = v_me;

  if v_game <> 'voice' and not exists (select 1 from public.app_games g where g.id = v_game and g.status = 'open') then
    raise exception 'هذه اللعبة غير متاحة بعد' using errcode = '22023';
  end if;

  insert into public.rooms (name, host, host_id, members, status, game, seats, topic)
  values (
    coalesce(nullif(trim(p_name), ''), 'غرفة ' || v_user.name),
    v_user.name,
    v_me,
    1,
    'live',
    v_game,
    v_seats,
    coalesce(trim(p_topic), '')
  )
  returning * into v_room;

  delete from public.app_room_members where user_id = v_me;
  insert into public.app_room_members (room_id, user_id) values (v_room.id, v_me);

  return json_build_object('id', v_room.id, 'name', v_room.name, 'game', v_room.game);
end;
$$;

create or replace function public.app_room_join(p_token uuid, p_room uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me    uuid := public.app_uid(p_token);
  v_room  public.rooms;
  v_count integer;
begin
  select * into v_room from public.rooms where id = p_room and host_id is not null;
  if v_room.id is null then
    raise exception 'الغرفة غير موجودة' using errcode = '22023';
  end if;
  if v_room.status = 'closed' then
    raise exception 'هذه الغرفة مغلقة' using errcode = '22023';
  end if;

  if not exists (select 1 from public.app_room_members m where m.room_id = p_room and m.user_id = v_me) then
    select count(*) into v_count from public.app_room_members m where m.room_id = p_room;
    if v_count >= v_room.seats then
      raise exception 'الغرفة ممتلئة — جرّب غرفة أخرى' using errcode = '22023';
    end if;
    delete from public.app_room_members where user_id = v_me;
    insert into public.app_room_members (room_id, user_id) values (p_room, v_me);
    update public.rooms set members = v_count + 1 where id = p_room;
  end if;

  return json_build_object('id', v_room.id, 'name', v_room.name);
end;
$$;

create or replace function public.app_room_get(p_token uuid, p_room uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me   uuid := public.app_uid(p_token);
  v_room public.rooms;
  v_host public.app_users;
  v_members json;
  v_messages json;
begin
  select * into v_room from public.rooms where id = p_room;
  if v_room.id is null then
    raise exception 'الغرفة غير موجودة' using errcode = '22023';
  end if;
  if not exists (select 1 from public.app_room_members m where m.room_id = p_room and m.user_id = v_me) then
    raise exception 'لست مشاركاً في هذه الغرفة' using errcode = '28000';
  end if;

  select * into v_host from public.app_users where id = v_room.host_id;

  select coalesce(json_agg(json_build_object(
           'id', u.id, 'name', u.name, 'host', u.id = v_room.host_id, 'joined_at', m.joined_at
         ) order by m.joined_at), '[]'::json)
    into v_members
  from public.app_room_members m
  join public.app_users u on u.id = m.user_id
  where m.room_id = p_room;

  select coalesce(json_agg(json_build_object(
           'id', msg.id, 'name', msg.name, 'text', msg.text,
           'mine', msg.user_id = v_me, 'created_at', msg.created_at
         ) order by msg.created_at), '[]'::json)
    into v_messages
  from (
    select * from public.app_room_messages
    where room_id = p_room
    order by created_at desc
    limit 60
  ) msg;

  return json_build_object(
    'room', json_build_object(
      'id', v_room.id, 'name', v_room.name, 'topic', v_room.topic,
      'game', v_room.game, 'seats', v_room.seats, 'status', v_room.status,
      'host', coalesce(v_host.name, v_room.host), 'host_id', v_room.host_id,
      'created_at', v_room.created_at
    ),
    'me', public.app_user_json(coalesce(v_host, (select u from public.app_users u where u.id = v_me))),
    'members', v_members,
    'messages', v_messages
  );
end;
$$;

create or replace function public.app_room_say(p_token uuid, p_room uuid, p_text text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me   uuid := public.app_uid(p_token);
  v_user public.app_users;
  v_msg  public.app_room_messages;
  v_text text := nullif(trim(coalesce(p_text, '')), '');
begin
  if v_text is null then
    raise exception 'الرسالة فارغة' using errcode = '22023';
  end if;
  if not exists (select 1 from public.app_room_members m where m.room_id = p_room and m.user_id = v_me) then
    raise exception 'لست مشاركاً في هذه الغرفة' using errcode = '28000';
  end if;

  select * into v_user from public.app_users where id = v_me;
  insert into public.app_room_messages (room_id, user_id, name, text)
  values (p_room, v_me, v_user.name, left(v_text, 500))
  returning * into v_msg;

  return json_build_object(
    'id', v_msg.id, 'name', v_msg.name, 'text', v_msg.text,
    'mine', true, 'created_at', v_msg.created_at
  );
end;
$$;

create or replace function public.app_room_leave(p_token uuid, p_room uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me   uuid := public.app_uid(p_token);
  v_host uuid;
begin
  delete from public.app_room_members where room_id = p_room and user_id = v_me;

  select host_id into v_host from public.rooms where id = p_room;
  if v_host = v_me then
    update public.rooms set status = 'closed' where id = p_room;
    delete from public.app_room_members where room_id = p_room;
  else
    update public.rooms
       set members = (select count(*) from public.app_room_members m where m.room_id = p_room)
     where id = p_room;
  end if;

  return json_build_object('ok', true);
end;
$$;

create or replace function public.app_room_update(
  p_token uuid,
  p_room  uuid,
  p_name  text default null,
  p_seats integer default null,
  p_topic text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me    uuid := public.app_uid(p_token);
  v_room  public.rooms;
  v_seats integer := case when p_seats is null then null else least(20, greatest(2, p_seats)) end;
begin
  select * into v_room from public.rooms where id = p_room;
  if v_room.id is null then
    raise exception 'الغرفة غير موجودة' using errcode = '22023';
  end if;
  if v_room.host_id <> v_me then
    raise exception 'إعدادات الغرفة للمضيف فقط' using errcode = '42501';
  end if;
  if v_seats is not null and v_seats < (select count(*) from public.app_room_members m where m.room_id = p_room) then
    raise exception 'لا يمكن تقليل المقاعد عن عدد المشاركين الحالي' using errcode = '22023';
  end if;

  update public.rooms
     set name  = coalesce(nullif(trim(coalesce(p_name, '')), ''), name),
         seats = coalesce(v_seats, seats),
         topic = coalesce(p_topic, topic)
   where id = p_room
  returning * into v_room;

  return json_build_object('id', v_room.id, 'name', v_room.name, 'seats', v_room.seats, 'topic', v_room.topic);
end;
$$;

create or replace function public.app_room_clear(p_token uuid, p_room uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me   uuid := public.app_uid(p_token);
  v_host uuid;
begin
  select host_id into v_host from public.rooms where id = p_room;
  if v_host is null then
    raise exception 'الغرفة غير موجودة' using errcode = '22023';
  end if;
  if v_host <> v_me then
    raise exception 'مسح الدردشة متاح للمضيف فقط' using errcode = '42501';
  end if;
  delete from public.app_room_messages where room_id = p_room;
  return json_build_object('ok', true);
end;
$$;

/* ---------- الألعاب ---------- */

create or replace function public.app_games_list(p_token uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := public.app_uid(p_token);
begin
  return coalesce((
    select json_agg(json_build_object(
             'id', g.id, 'name', g.name, 'tagline', g.tagline, 'status', g.status,
             'tables', (select count(*) from public.rooms r
                        where r.game = g.id and r.host_id is not null and r.status = 'live')
           ) order by g.sort)
    from public.app_games g
  ), '[]'::json);
end;
$$;

/* ---------- الصلاحيات ---------- */

grant usage on schema public to anon, authenticated;

grant execute on function
  public.app_signup(text, text, text, text),
  public.app_login(text, text),
  public.app_guest(text),
  public.app_session(uuid),
  public.app_logout(uuid),
  public.app_profile_save(uuid, text, text),
  public.app_friends(uuid),
  public.app_friend_search(uuid, text),
  public.app_friend_request(uuid, uuid),
  public.app_friend_respond(uuid, uuid, boolean),
  public.app_friend_remove(uuid, uuid),
  public.app_rooms(uuid, text),
  public.app_room_create(uuid, text, text, integer, text),
  public.app_room_join(uuid, uuid),
  public.app_room_get(uuid, uuid),
  public.app_room_say(uuid, uuid, text),
  public.app_room_leave(uuid, uuid),
  public.app_room_update(uuid, uuid, text, integer, text),
  public.app_room_clear(uuid, uuid),
  public.app_games_list(uuid)
to anon, authenticated;

revoke all on public.app_users, public.app_sessions, public.app_friendships,
  public.app_room_members, public.app_room_messages from anon, authenticated;

notify pgrst, 'reload schema';
