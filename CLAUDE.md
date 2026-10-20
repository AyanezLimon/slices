# Slices: contexto para Claude Code

PWA familiar para repartir quehaceres (familia Limón: Santiago, Isis, Victoria, Aries, y una persona de fin de semana que quizás no use la app). La UI está en español y le habla de tú a la persona. El costo es cero. El dueño prefiere soluciones directas, sin sobre-ingeniería.

## Stack
- **Frontend.** Vite + Preact en `src/`, con router por hash (`#/hoy`, `#/admin`, `#/admin/tarea/:id`, `#/admin/miembros`, `#/perfil`, `#/perfil/foto`, `#/guia`, `#/unirse/:code`). Se publica en GitHub Pages con base `/slices/`.
- **Backend.** Supabase:
  - Postgres con RLS.
  - Auth con Google (PKCE).
  - Realtime.
  - Storage, solo para el bucket `avatars`.
- **Avisos.** Web Push con VAPID. `pg_cron` corre cada minuto, `pg_net` llama a la Edge Function `notify`, y esta envía los avisos.
- **Diseño.** Design System "Slices" en Claude Design. Los tokens están copiados en `src/styles.css`, con temas claro y oscuro y la preferencia guardada en `member_prefs.theme`. El mockup de pantallas está en el canvas "App de Quehaceres".

## Piezas clave
- **`supabase/functions/_shared/schedule.js`.** Es la única fuente de verdad de la rotación. Lo usan la PWA y la función.
  - Las reglas están versionadas por `effective_from`. Al editar una tarea se agrega una regla nueva; nunca se sobrescribe una anterior.
  - Corre `npm test` después de cualquier cambio a este archivo.
- **Cobertura.** Si A no puede y B cubre la fecha *d*, A paga en el siguiente turno base de B en esa misma tarea.
  - Lo resuelve `findReturnDate`.
  - La RPC `cover_task` crea las dos filas `overrides` (`cubre` y `devuelve`) en una sola transacción.
- **`supabase/functions/notify/index.ts`.** Según el header y el `run` recibido:
  - Header `x-cron-secret` + `run: "cycle"`: recordatorios, insistencia a las 20:00, pedidos de cobertura y "te cubrieron".
  - `run: "release"`: aviso de versión nueva.
  - `run: "setup"`: guarda en `app_config` la URL y el secreto que usa el cron.
  - Con el JWT de un usuario: aviso de prueba.
  - El dedupe usa `push_log.dedupe_key`.
- **`src/sw.js`.** Es una plantilla; `vite.config.js` le inyecta la versión y la lista de precache.
  - Navegación network-first.
  - Cada push siempre muestra una notificación; en iOS es obligatorio.
  - Acuse de recibo vía `rpc/push_ack`.
- **`src/lib/updates.js`.** Compara `version.json` con `__APP_VERSION__`.
  - Si la persona no ha tocado nada, recarga en silencio.
  - Si no, muestra un banner y aplica la actualización al volver a la app.

## Publicar
Un release `vX.Y.Z` en GitHub dispara `.github/workflows/release.yml`: tests y build, migraciones y función en Supabase, deploy a Pages y aviso a la casa. Las variables y secretos necesarios están en el README.

## Pendiente de decidir con Aries
- Qué pasa si nadie hace una tarea. Por ahora queda sin marcar; no se arrastra al día siguiente.
