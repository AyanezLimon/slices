-- Varias personas en una misma tarea: cada ocurrencia tiene "puestos", uno por
-- persona que le toca por regla. Coberturas, devoluciones y completadas ahora van
-- por puesto (slot_of = id de quien tiene ese puesto por regla). Las filas viejas
-- quedan con slot_of null y valen para el primer puesto del día (ver schedule.js).

alter table public.overrides add column if not exists slot_of uuid references public.members (id);
alter table public.overrides drop constraint if exists overrides_chore_id_date_key;
alter table public.overrides add constraint overrides_slot_key unique nulls not distinct (chore_id, date, slot_of);

alter table public.completions add column if not exists slot_of uuid references public.members (id);
alter table public.completions drop constraint if exists completions_pkey;
alter table public.completions add constraint completions_slot_key unique nulls not distinct (chore_id, date, slot_of);

-- Cada persona del día puede pedir que la cubran.
drop index if exists public.cover_requests_one_pending;
create unique index cover_requests_one_pending on public.cover_requests (chore_id, date, requester) where status = 'pending';

-- p_slot: puesto que se cubre (null = forma vieja, una sola persona por día).
drop function if exists public.cover_task(uuid, date, uuid, date, uuid, boolean);
create or replace function public.cover_task(
  p_chore uuid, p_date date, p_covered uuid, p_return_date date,
  p_request uuid default null, p_mark_done boolean default false, p_slot uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := current_member_id(); pair uuid := gen_random_uuid();
begin
  if me is null then raise exception 'No eres miembro'; end if;
  if me = p_covered then raise exception 'No puedes cubrirte a ti mismo'; end if;
  if p_return_date is not null and p_return_date <= p_date then
    raise exception 'La devolución debe ser posterior';
  end if;

  insert into overrides (chore_id, date, slot_of, assignee, covered_member, reason, pair_id, created_by)
  values (p_chore, p_date, p_slot, me, p_covered, 'cubre', pair, me)
  on conflict on constraint overrides_slot_key do update
    set assignee = excluded.assignee, covered_member = excluded.covered_member, reason = 'cubre',
        pair_id = excluded.pair_id, created_by = excluded.created_by, notified_at = null, created_at = now();

  -- La devolución ocupa el puesto de quien cubre en su siguiente turno.
  if p_return_date is not null then
    insert into overrides (chore_id, date, slot_of, assignee, covered_member, reason, pair_id, created_by)
    values (p_chore, p_return_date, case when p_slot is null then null else me end, p_covered, me, 'devuelve', pair, me);
  end if;

  if p_request is not null then
    update cover_requests set status = 'accepted', accepted_by = me, resolved_at = now()
    where id = p_request and status = 'pending';
  else
    update cover_requests set status = 'accepted', accepted_by = me, resolved_at = now()
    where chore_id = p_chore and date = p_date and requester = p_covered and status = 'pending';
  end if;

  if p_mark_done then
    insert into completions (chore_id, date, slot_of, done_by) values (p_chore, p_date, p_slot, me)
    on conflict do nothing;
  end if;

  perform audit('cover', 'override', pair,
    jsonb_build_object('chore', p_chore, 'date', p_date, 'slot', p_slot, 'covered', p_covered, 'return', p_return_date));
  return pair;
end $$;
