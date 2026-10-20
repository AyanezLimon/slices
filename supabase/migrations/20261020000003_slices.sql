-- Slices: tema por persona, color de persona, aviso de actualizaciones y helpers de entrada.

alter table public.members
  add column if not exists color_index int not null default 1 check (color_index between 1 and 5);

alter table public.member_prefs
  add column if not exists theme text not null default 'system' check (theme in ('system', 'light', 'dark'));

alter table public.member_prefs
  alter column cover set default '{"meCubren": true, "mePiden": true, "devolver": true, "general": false, "actualizaciones": true}';

-- Para la pantalla de entrada: ¿ya existe la casa? (un no-miembro no puede leer members)
create or replace function public.house_exists() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members)
$$;
grant execute on function public.house_exists() to authenticated;

-- La primera persona toma el color 4 (verde) y queda como admin.
create or replace function public.bootstrap_house(p_name text) returns public.members
language plpgsql security definer set search_path = public as $$
declare m members;
begin
  if auth.uid() is null then raise exception 'Inicia sesión primero'; end if;
  if exists (select 1 from members) then raise exception 'La casa ya existe; pide un código de invitación'; end if;
  insert into members (name, role, user_id, color_index) values (trim(p_name), 'admin', auth.uid(), 4) returning * into m;
  insert into member_prefs (member_id) values (m.id);
  return m;
end $$;

-- Las preferencias se crean al vuelo si faltan (perfiles creados por un admin).
create or replace function public.ensure_my_prefs() returns public.member_prefs
language plpgsql security definer set search_path = public as $$
declare me uuid := current_member_id(); p member_prefs;
begin
  if me is null then raise exception 'No eres miembro'; end if;
  insert into member_prefs (member_id) values (me) on conflict do nothing;
  select * into p from member_prefs where member_id = me;
  return p;
end $$;
grant execute on function public.ensure_my_prefs() to authenticated;
