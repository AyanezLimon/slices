-- Lista de compras: una lista de la casa (owner null) y una personal por miembro
-- (owner = su id, solo la ve esa persona). Al comprar se llena bought_at; las
-- filas compradas se quedan para "Lo de siempre" (sugerencias por frecuencia).
create table if not exists public.shopping_items (
  id         uuid primary key default gen_random_uuid(), -- Realtime necesita llave primaria
  name       text not null check (length(trim(name)) between 1 and 80),
  note       text check (note is null or length(note) <= 140),
  owner      uuid references public.members (id) on delete cascade,
  added_by   uuid references public.members (id) on delete set null default public.current_member_id(),
  added_at   timestamptz not null default now(),
  bought_by  uuid references public.members (id) on delete set null,
  bought_at  timestamptz
);
create index if not exists shopping_items_owner_idx on public.shopping_items (owner, bought_at);

alter table public.shopping_items enable row level security;

drop policy if exists "ver compras" on public.shopping_items;
drop policy if exists "agregar compras" on public.shopping_items;
drop policy if exists "editar compras" on public.shopping_items;
drop policy if exists "quitar compras" on public.shopping_items;
create policy "ver compras" on public.shopping_items for select
  using (is_member() and (owner is null or owner = current_member_id()));
create policy "agregar compras" on public.shopping_items for insert
  with check (is_member() and added_by = current_member_id() and (owner is null or owner = current_member_id()));
create policy "editar compras" on public.shopping_items for update
  using (is_member() and (owner is null or owner = current_member_id()))
  with check (owner is null or owner = current_member_id());
create policy "quitar compras" on public.shopping_items for delete
  using (is_member() and (owner is null or owner = current_member_id()));

do $$ begin
  alter publication supabase_realtime add table public.shopping_items;
exception when duplicate_object then null;
end $$;
