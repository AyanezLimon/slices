# Slices: contexto para Claude Code

PWA familiar para repartir quehaceres (familia Limón: Santiago, Isis, Victoria, Aries, y una persona de fin de semana que quizás no use la app). La UI está en español y le habla de tú a la persona. El costo es cero. El dueño prefiere soluciones directas, sin sobre-ingeniería.

## Stack
- **Frontend.** Vite + Preact en `src/`, con router por hash (`#/hoy`, `#/semana`, `#/compras`, `#/admin`, `#/admin/tarea/:id`, `#/admin/miembros`, `#/perfil`, `#/perfil/foto`, `#/guia`, `#/unirse/:code`). Se publica en GitHub Pages con base `/slices/`.
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
  - Una ocurrencia puede tener varias personas ("puestos"). En `weekly` cada día es `{people: [...], rotate}` (la forma vieja `{fixed}`/`{rotate}` sigue valiendo), `rotation` dice quiénes entran al día rotativo, `rotation_days` el día propio de alguien de la rotación (semanas de lunes a domingo) y `per_turn` cuántas personas por turno.
  - `overrides` y `completions` van por puesto con `slot_of` (id de quien tiene el puesto por regla). Las filas viejas sin `slot_of` valen para el primer puesto del día.
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
- **Compras (`src/lib/shopping.js`, `src/screens/Shopping.jsx`).** Tabla `shopping_items`: `owner` null es la lista de la casa; `owner` = id de un miembro es su lista personal y RLS solo se la deja ver a esa persona. Comprar llena `bought_at`; lo comprado sale de la lista al día siguiente pero se queda 90 días para "Lo de siempre" (sugerencias por frecuencia). Los cambios son optimistas (el id lo genera la PWA). El número de la pestaña cuenta solo la lista de la casa.
- **Semana (`src/screens/Week.jsx`).** Plan de lunes a domingo con flechas entre semanas, calculado con `dutiesOn` para cada fecha. En el celular es una lista por día con filtro por persona (los días ya pasados de esta semana van plegados); en pantalla ancha, una tabla tareas × días con pastillas del color de cada persona y tarjetas por persona que resaltan lo suyo. `useHouse` trae coberturas y completadas desde hace 7 días; para semanas más viejas la pantalla las pide con `loadRange`. Lo pasado sin marcar sale como "sin hacer".
- **Pantalla ancha.** Desde 1024 px la barra de abajo pasa a barra lateral, Hoy va en dos columnas, Semana pasa a tabla, Administrar en cuadrícula y las hojas inferiores son diálogos centrados. Todo está en el bloque `@media (min-width: 1024px)` de `src/styles.css`; en el celular las columnas de Hoy usan `display: contents` y `order`.
- **`src/lib/updates.js`.** Compara `version.json` con `__APP_VERSION__`.
  - Si la persona no ha tocado nada, recarga en silencio.
  - Si no, muestra un banner y aplica la actualización al volver a la app.

## Publicar
Cada merge a `main` corre `.github/workflows/auto-release.yml`: crea el release `vX.Y.Z` y lanza `.github/workflows/release.yml` (tests y build, migraciones y función en Supabase, deploy a Pages y aviso a la casa). En la descripción de cada PR pon `Aviso: <texto>` (primera línea de las notas y texto del push; si falta, el título del PR) y `Versión: mayor | menor | parche | ninguna` (si falta, parche). Un release publicado a mano sigue funcionando igual. Las variables y secretos necesarios están en el README.

## Estado y siguiente paso: puesta en marcha
El código está completo: compila y los 18 tests pasan. Todavía **no hay nada configurado**: Supabase, Pages, variables y secretos del repo están pendientes. Orden sugerido:

1. **Supabase.** Aries crea el proyecto y obtiene la URL, la anon key, el ref y la contraseña de la base.
   - Si tienes la CLI y acceso: `supabase link`, luego `supabase db push`.
   - Si no, el workflow Release lo hace con `SUPABASE_ACCESS_TOKEN` y `SUPABASE_DB_PASSWORD`.
2. **Llaves VAPID** con `npx web-push generate-vapid-keys` y un `CRON_SECRET` con `openssl rand -hex 32`.
3. **Variables y secretos del repo** según la tabla del README. Con `gh`: `gh variable set …` y `gh secret set …`.
4. **Pages.** Source en "GitHub Actions" (`gh api -X POST repos/AyanezLimon/slices/pages -f build_type=workflow`) y permitir tags `v*` en el environment `github-pages` (`gh api -X POST repos/AyanezLimon/slices/environments/github-pages/deployment-branch-policies -f name='v*' -f type=tag`).
5. **Google OAuth** y las URLs de Auth en Supabase (pasos en el README). La URL de la app es `https://ayanezlimon.github.io/slices/`.
6. **Primer release** `v1.0.0`. El workflow despliega la función y llama `run: "setup"` para que el cron funcione. Después, abrir la app, crear la casa e invitar a la familia.
7. **Verificar:**
   - El aviso de prueba desde Perfil.
   - Que `select * from cron.job_run_details order by start_time desc limit 5` muestre ejecuciones exitosas.
   - La migración de storage (políticas en `storage.objects`). Si falla por permisos, crear esas tres políticas desde el dashboard.

## Pendiente de decidir con Aries
- Qué pasa si nadie hace una tarea. Por ahora queda sin marcar; no se arrastra al día siguiente.
