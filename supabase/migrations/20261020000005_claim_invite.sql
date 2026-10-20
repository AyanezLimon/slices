-- Unirse con código fallaba: claim_invite pone user_id en el miembro, y el
-- trigger guard_members lo bloqueaba porque quien se une todavía no es admin.
-- claim_invite marca la transacción y el trigger deja pasar solo ese cambio.

create or replace function public.guard_members() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and not is_admin()
     and coalesce(current_setting('slices.claiming', true), '') <> 'on' then
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
  perform set_config('slices.claiming', 'on', true);
  update members set user_id = auth.uid() where id = inv.member_id and user_id is null returning * into m;
  if m.id is null then raise exception 'Ese perfil ya fue reclamado'; end if;
  perform set_config('slices.claiming', 'off', true);
  update invites set used_at = now() where code = inv.code;
  insert into member_prefs (member_id) values (m.id) on conflict do nothing;
  return m;
end $$;
