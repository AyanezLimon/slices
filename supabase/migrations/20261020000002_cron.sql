-- Cron cada minuto → Edge Function "notify".
-- Antes de aplicar, guarda dos secretos en Vault (SQL editor):
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   select vault.create_secret('<el mismo valor que CRON_SECRET de la función>', 'cron_secret');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'slices-notify',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"run": "cycle"}'::jsonb,
    timeout_milliseconds := 25000
  );
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
