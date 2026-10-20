-- Cron cada minuto → Edge Function "notify".
-- La URL del proyecto y el secreto del cron los guarda la propia función en app_config
-- (el workflow de release la llama con {"run":"setup"} después de desplegarla).

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create table if not exists public.app_config (
  key    text primary key,
  value  text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security; -- sin políticas: solo service role y cron

select cron.schedule(
  'slices-notify',
  '* * * * *',
  $$
  select net.http_post(
    url := (select value from public.app_config where key = 'project_url') || '/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from public.app_config where key = 'cron_secret')
    ),
    body := '{"run": "cycle"}'::jsonb,
    timeout_milliseconds := 25000
  )
  where exists (select 1 from public.app_config where key = 'cron_secret');
  $$
);

-- Limpieza semanal de logs viejos.
select cron.schedule(
  'slices-cleanup',
  '0 3 * * 0',
  $$
  delete from public.push_log where sent_at < now() - interval '60 days';
  delete from cron.job_run_details where end_time < now() - interval '7 days';
  $$
);
