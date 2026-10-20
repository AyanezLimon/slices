-- Slices · esquema inicial (una sola casa por proyecto de Supabase)

create extension if not exists pgcrypto;

-- ───────────────────────── Tablas ─────────────────────────

create table public.members (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  color       int not null default 5 check (color between 1 and 5), -- índice de persona-1…5 en design/tokens.json
  -- {"type":"icon","icon":"sol","color":"verde"} | {"type":"photo","url":"..."}
  avatar      jsonb not null default '{"type":"initial"}',
  role        text not null default 'member' check (role in ('admin', 'member')),
  user_id     uuid unique references auth.users (id) on delete set null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.chores (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(trim(name)) > 0),
  description   text,
  active        boolean not null default true,
  default_time  time not null default '08:00',
  -- reglas versionadas; ver supabase/functions/_shared/schedule.js
  rules         jsonb not null default '[]' check (jsonb_typeof(rules) = 'array'),
  sort          int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Coberturas y devoluciones: le ganan a la regla para (tarea, fecha).
create table public.overrides (
  id              uuid primary key default gen_random_uuid(),
  chore_id        uuid not null references public.chores (id) on delete cascade,
  date            date not null,
  assignee        uuid not null references public.members (id),
  covered_member  uuid references public.members (id),
  reason          text not null check (reason in ('cubre', 'devuelve', 'manual')),
  pair_id         uuid,
  created_by      uuid references public.members (id),
  notified_at     timestamptz,
  created_at      timestamptz not null default now(),
  unique (chore_id, date)
);

create table public.completions (
  chore_id  uuid not null references public.chores (id) on delete cascade,
  date      date not null,
  done_by   uuid not null references public.members (id),
  done_at   timestamptz not null default now(),
  primary key (chore_id, date)
);

create table public.cover_requests (
  id           uuid primary key default gen_random_uuid(),
  chore_id     uuid not null references public.chores (id) on delete cascade,
  date         date not null,
  requester    uuid not null references public.members (id),
  target       uuid references public.members (id), -- null = a cualquiera
  status       text not null default 'pending' check (status in ('pending', 'accepted', 'cancelled')),
  accepted_by  uuid references public.members (id),
  notified_at  timestamptz,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);
create unique index cover_requests_one_pending on public.cover_requests (chore_id, date) where status = 'pending';

create table public.member_prefs (
  member_id   uuid primary key references public.members (id) on delete cascade,
  -- {"<choreId>": {"on": true, "time": "18:30", "insist": false}}
  chores      jsonb not null default '{}',
  cover       jsonb not null default '{"meCubren": true, "mePiden": true, "devolver": true, "general": false}',
  theme       text not null default 'system' check (theme in ('system', 'light', 'dark')),
  updated_at  timestamptz not null default now()
);

create table public.push_subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  member_id          uuid not null references public.members (id) on delete cascade,
  endpoint           text not null unique,
  p256dh             text not null,
  auth               text not null,
  label              text,
  created_at         timestamptz not null default now(),
  last_seen_at       timestamptz not null default now(),
  last_sent_at       timestamptz,
  last_receipt_at    timestamptz,
  unconfirmed_count  int not null default 0
);

-- Registro de envíos; dedupe_key evita duplicados si el cron corre dos veces.
create table public.push_log (
  id          bigserial primary key,
  member_id   uuid references public.members (id) on delete cascade,
  dedupe_key  text not null unique,
  kind        text not null,
  payload     jsonb,
  delivered   int not null default 0,
  failed      int not null default 0,
  sent_at     timestamptz not null default now()
);

create table public.invites (
  code        text primary key,
  member_id   uuid not null references public.members (id) on delete cascade,
  created_by  uuid references public.members (id),
  expires_at  timestamptz not null default now() + interval '48 hours',
  used_at     timestamptz
);

create table public.audit_log (
  id         bigserial primary key,
  actor      uuid references public.members (id),
  action     text not null,
  entity     text not null,
  entity_id  uuid,
  data       jsonb,
  at         timestamptz not null default now()
);

create index on public.overrides (date);
create index on public.completions (date);
create index on public.push_subscriptions (member_id);

-- ───────────────────────── Helpers ─────────────────────────

create or replace function public.current_member_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from members where user_id = auth.uid() and active
$$;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where user_id = auth.uid() and active)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where user_id = auth.uid() and active and role = 'admin')
$$;

create or replace function public.audit(p_action text, p_entity text, p_id uuid, p_data jsonb)
returns void language sql security definer set search_path = public as $$
  insert into audit_log (actor, action, entity, entity_id, data)
  values (current_member_id(), p_action, p_entity, p_id, p_data)
$$;

-- ───────────────────────── Triggers ─────────────────────────

-- Un no-admin solo puede cambiar su nombre, color y avatar.
create or replace function public.guard_members() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and not is_admin() then
    if new.role is distinct from old.role or new.user_id is distinct from old.user_id
       or new.active is distinct from old.active then
      raise exception 'Solo un administrador puede cambiar rol, cuenta o estado';
    end if;
  end if;
  -- siempre debe quedar al menos un admin activo
  if (tg_op = 'DELETE' and old.role = 'admin' and old.active)
     or (tg_op = 'UPDATE' and old.role = 'admin' and old.active and (new.role <> 'admin' or not new.active)) then
    if (select count(*) from members where role = 'admin' and active and id <> old.id) = 0 then
      raise exception 'Debe quedar al menos un administrador';
    end if;
  end if;
  return coalesce(new, old);
end $$;

create trigger members_guard before update or delete on public.members
for each row execute function public.guard_members();

create or replace function public.touch_and_audit_chores() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then new.updated_at := now(); end if;
  perform audit(lower(tg_op), 'chore', coalesce(new.id, old.id),
                case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create trigger chores_audit before insert or update or delete on public.chores
for each row execute function public.touch_and_audit_chores();

-- ───────────────────────── RLS ─────────────────────────

alter table public.members            enable row level security;
alter table public.chores             enable row level security;
alter table public.overrides          enable row level security;
alter table public.completions        enable row level security;
alter table public.cover_requests     enable row level security;
alter table public.member_prefs       enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.push_log           enable row level security; -- sin políticas: solo service role
alter table public.invites            enable row level security;
alter table public.audit_log          enable row level security;

create policy "miembros ven la casa" on public.members for select using (is_member());
create policy "admin crea miembros" on public.members for insert with check (is_admin());
create policy "admin o uno mismo edita" on public.members for update using (is_admin() or id = current_member_id());
create policy "admin borra miembros" on public.members for delete using (is_admin());

create policy "miembros ven tareas" on public.chores for select using (is_member());
create policy "admin gestiona tareas" on public.chores for all using (is_admin()) with check (is_admin());

create policy "miembros ven overrides" on public.overrides for select using (is_member());
create policy "admin gestiona overrides" on public.overrides for all using (is_admin()) with check (is_admin());

create policy "miembros ven completadas" on public.completions for select using (is_member());
create policy "marcar como hecha" on public.completions for insert with check (is_member() and done_by = current_member_id());
create policy "deshacer propia o admin" on public.completions for delete using (done_by = current_member_id() or is_admin());

create policy "miembros ven pedidos" on public.cover_requests for select using (is_member());
create policy "pedir cobertura de lo propio" on public.cover_requests for insert
  with check (is_member() and requester = current_member_id() and status = 'pending');

create policy "mis preferencias" on public.member_prefs for all
  using (member_id = current_member_id()) with check (member_id = current_member_id());

create policy "mis dispositivos" on public.push_subscriptions for all
  using (member_id = current_member_id()) with check (member_id = current_member_id());

create policy "admin ve invitaciones" on public.invites for select using (is_admin());
create policy "admin borra invitaciones" on public.invites for delete using (is_admin());

create policy "miembros ven historial" on public.audit_log for select using (is_member());

-- ───────────────────────── RPCs ─────────────────────────

-- Primera persona en entrar a una casa vacía queda como admin.
create or replace function public.bootstrap_house(p_name text) returns public.members
language plpgsql security definer set search_path = public as $$
declare m members;
begin
  if auth.uid() is null then raise exception 'Inicia sesión primero'; end if;
  if exists (select 1 from members) then raise exception 'La casa ya existe; pide un código de invitación'; end if;
  insert into members (name, role, user_id) values (p_name, 'admin', auth.uid()) returning * into m;
  insert into member_prefs (member_id) values (m.id);
  return m;
end $$;

create or replace function public.create_invite(p_member uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text;
begin
  if not is_admin() then raise exception 'Solo administradores'; end if;
  if (select user_id from members where id = p_member) is not null then
    raise exception 'Ese miembro ya tiene cuenta';
  end if;
  loop
    c := '';
    for i in 1..6 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
      if i = 3 then c := c || '-'; end if;
    end loop;
    exit when not exists (select 1 from invites where code = c);
  end loop;
  delete from invites where member_id = p_member and used_at is null;
  insert into invites (code, member_id, created_by) values (c, p_member, current_member_id());
  return c;
end $$;

create or replace function public.claim_invite(p_code text) returns public.members
language plpgsql security definer set search_path = public as $$
declare inv invites; m members;
begin
  if auth.uid() is null then raise exception 'Inicia sesión primero'; end if;
  if exists (select 1 from members where user_id = auth.uid()) then
    raise exception 'Tu cuenta ya está en la casa';
  end if;
  select * into inv from invites where code = upper(trim(p_code)) for update;
  if inv.code is null or inv.used_at is not null or inv.expires_at < now() then
    raise exception 'Código inválido o vencido';
  end if;
  update members set user_id = auth.uid() where id = inv.member_id and user_id is null returning * into m;
  if m.id is null then raise exception 'Ese perfil ya fue reclamado'; end if;
  update invites set used_at = now() where code = inv.code;
  insert into member_prefs (member_id) values (m.id) on conflict do nothing;
  return m;
end $$;

create or replace function public.request_cover(p_chore uuid, p_date date, p_target uuid default null)
returns public.cover_requests
language plpgsql security definer set search_path = public as $$
declare r cover_requests; me uuid := current_member_id();
begin
  if me is null then raise exception 'No eres miembro'; end if;
  if p_target = me then raise exception 'No puedes pedirte a ti mismo'; end if;
  insert into cover_requests (chore_id, date, requester, target)
  values (p_chore, p_date, me, p_target) returning * into r;
  perform audit('request_cover', 'cover_request', r.id, to_jsonb(r));
  return r;
end $$;

create or replace function public.cancel_cover_request(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update cover_requests set status = 'cancelled', resolved_at = now()
  where id = p_id and status = 'pending' and (requester = current_member_id() or is_admin());
end $$;

-- Quien llama cubre a p_covered en (p_chore, p_date). p_return_date lo calcula el
-- cliente con findReturnDate() (siguiente turno base de quien cubre). Todo en una transacción.
create or replace function public.cover_task(
  p_chore uuid, p_date date, p_covered uuid, p_return_date date,
  p_request uuid default null, p_mark_done boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := current_member_id(); pair uuid := gen_random_uuid();
begin
  if me is null then raise exception 'No eres miembro'; end if;
  if me = p_covered then raise exception 'No puedes cubrirte a ti mismo'; end if;
  if p_return_date is not null and p_return_date <= p_date then
    raise exception 'La devolución debe ser posterior';
  end if;

  insert into overrides (chore_id, date, assignee, covered_member, reason, pair_id, created_by)
  values (p_chore, p_date, me, p_covered, 'cubre', pair, me)
  on conflict (chore_id, date) do update
    set assignee = excluded.assignee, covered_member = excluded.covered_member, reason = 'cubre',
        pair_id = excluded.pair_id, created_by = excluded.created_by, notified_at = null, created_at = now();

  if p_return_date is not null then
    insert into overrides (chore_id, date, assignee, covered_member, reason, pair_id, created_by)
    values (p_chore, p_return_date, p_covered, me, 'devuelve', pair, me);
  end if;

  if p_request is not null then
    update cover_requests set status = 'accepted', accepted_by = me, resolved_at = now()
    where id = p_request and status = 'pending';
  else
    update cover_requests set status = 'accepted', accepted_by = me, resolved_at = now()
    where chore_id = p_chore and date = p_date and status = 'pending';
  end if;

  if p_mark_done then
    insert into completions (chore_id, date, done_by) values (p_chore, p_date, me)
    on conflict (chore_id, date) do nothing;
  end if;

  perform audit('cover', 'override', pair,
    jsonb_build_object('chore', p_chore, 'date', p_date, 'covered', p_covered, 'return', p_return_date));
  return pair;
end $$;

-- Acuse de recibo desde el service worker (sin sesión: el endpoint funciona como secreto).
create or replace function public.push_ack(p_endpoint text) returns void
language sql security definer set search_path = public as $$
  update push_subscriptions set last_receipt_at = now(), unconfirmed_count = 0 where endpoint = p_endpoint
$$;

-- Salud de avisos por dispositivo, para la alerta en Admin · miembros.
create or replace function public.device_health()
returns table (member_id uuid, label text, last_sent_at timestamptz, last_receipt_at timestamptz, unconfirmed_count int)
language sql stable security definer set search_path = public as $$
  select member_id, label, last_sent_at, last_receipt_at, unconfirmed_count
  from push_subscriptions where is_member()
$$;

-- Para el keepalive semanal (evita que el proyecto gratis se pause).
create or replace function public.ping() returns timestamptz language sql as $$ select now() $$;

revoke all on function public.push_ack(text) from public;
grant execute on function public.push_ack(text) to anon, authenticated;
grant execute on function public.ping() to anon, authenticated;

-- ───────────────────────── Realtime ─────────────────────────

alter publication supabase_realtime add table
  public.members, public.chores, public.overrides, public.completions, public.cover_requests;

-- ───────────────────────── Storage: fotos de perfil ─────────────────────────
-- Ruta: avatars/<member_id>/avatar.webp (128x128, la PWA la reduce antes de subir)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 204800, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "subir mi avatar" on storage.objects for insert
  with check (bucket_id = 'avatars' and ((storage.foldername(name))[1] = current_member_id()::text or is_admin()));
create policy "cambiar mi avatar" on storage.objects for update
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = current_member_id()::text or is_admin()));
create policy "borrar mi avatar" on storage.objects for delete
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = current_member_id()::text or is_admin()));
