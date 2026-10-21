-- 20261021000001 quitó la llave primaria de completions para permitir un puesto
-- por persona. Como completions está en Realtime, Postgres exige una identidad de
-- réplica para borrar filas, y sin llave primaria fallaban "deshacer" y borrar tareas.
-- Idempotente: se puede correr a mano en el SQL Editor antes del release.
alter table public.completions add column if not exists id uuid not null default gen_random_uuid();
alter table public.completions drop constraint if exists completions_pkey;
alter table public.completions add constraint completions_pkey primary key (id);
