# Quehaceres — contexto para Claude Code

PWA familiar para repartir quehaceres. Costo cero. Usuarios: Santiago, Isis, Victoria, Aries
(+ una persona de fin de semana que puede no usar la app). Idioma de la UI: español.
Preferencia del dueño: soluciones directas, sin sobre-ingeniería.

## Stack (decidido)
- Frontend: Vite + Preact, PWA (manifest + service worker propio), router por hash (`#/hoy`), deploy a GitHub Pages (`base: '/<repo>/'`).
- Backend: Supabase (Postgres + RLS, Auth con Google usando `flowType: 'pkce'`, Realtime, Storage para avatares).
- Avisos: Web Push estándar (VAPID, sin Firebase). `pg_cron` cada minuto → `pg_net` → Edge Function `notify`.
- Keepalive: GitHub Action semanal que llama `rpc/ping` (el plan gratis pausa tras 7 días sin actividad).
- Zona horaria de la casa: `America/Costa_Rica` (constante en `_shared/schedule.js`).

## Lo que YA está hecho
- `supabase/functions/_shared/schedule.js`: única fuente de verdad de la rotación. La usan la PWA (importarla vía alias de Vite) y la Edge Function.
  - Reglas versionadas en `chores.rules` (jsonb array). Rige la de `effective_from` más reciente <= fecha. **Al editar una tarea se agrega una regla nueva con `effective_from` = hoy (o la fecha elegida). Nunca se sobrescribe la anterior.**
  - Modos: `weekly` (slots 1–7 con `{fixed}` o `{rotate}`, donde rotate gira semanalmente sobre `participants`), `every_n`, `daily_rotation` (con `days` opcional).
  - `assigneeOn` aplica overrides. `findReturnDate(chore, fecha, quienCubre)` devuelve el siguiente turno base de quien cubre que no tenga override. Ahí paga la persona cubierta.
- `tests/schedule.test.js`: 18 tests con vitest, todos pasan. Correr `npm test` después de cualquier cambio a schedule.js.
- `supabase/migrations/…_init.sql`: tablas, RLS, triggers (solo un admin cambia rol/cuenta/estado; siempre queda ≥1 admin; auditoría de chores), RPCs (`bootstrap_house`, `create_invite`, `claim_invite`, `request_cover`, `cancel_cover_request`, `cover_task`, `push_ack`, `device_health`, `ping`), publicación realtime y bucket `avatars`.
- `supabase/migrations/…_cron.sql`: cron por minuto con secretos en Vault (`project_url`, `cron_secret`) y limpieza semanal.
- Mockup de las 8 pantallas: canvas de Claude Design "App de Quehaceres" (pídele a Aries el link). Es la referencia visual: verde `#0E7C66`, fondo `#F3F5F7`, Plus Jakarta Sans, tarjetas blancas con radio 16, targets ≥44px, barra inferior Hoy / Admin / Perfil.

## Lo que FALTA (en este orden)

### 1. Edge Function `supabase/functions/notify/index.ts` (Deno, `npm:web-push`, service role)
Config `verify_jwt = false`. La función autentica por su cuenta:
- Header `x-cron-secret` == env `CRON_SECRET` → corre el ciclo.
- `Authorization: Bearer <jwt de usuario>` + body `{test:true}` → `auth.getUser()` y envía un aviso de prueba solo a ese miembro.

Ciclo (cada minuto, con `nowIn(TZ)`):
1. **Recordatorios por persona y tarea.** Para cada duty de hoy (`dutiesOn`), si es del miembro, toma la pref `member_prefs.chores[choreId]`. Si no existe, el default es `{on:true, time: chore.default_time, insist:false}`. Se envía cuando `on && time <= ahora` (con ventana de recuperación de 6 h). Si alguien tiene varias, se agrupan en un solo push ("Hoy te toca: X, Y"). Un turno de devolución (override `devuelve` del miembro) entra aunque la pref de la tarea esté apagada si `cover.devolver` está activo, y el texto lo menciona.
2. **Insistir 20:00.** Si `insist` está activo, la tarea no está en `completions` y ya son ≥ 20:00.
3. **Pedidos de cobertura.** `cover_requests` pendientes con `notified_at` null: se avisa a `target` si tiene `mePiden`, o a todos los demás participantes con `general` si target es null. Después se marca `notified_at`.
4. **"Te cubrieron".** `overrides` con reason `cubre` y `notified_at` null: se avisa a `covered_member` si tiene `meCubren`, incluyendo la fecha de devolución (override `devuelve` con el mismo `pair_id`). Después se marca `notified_at`.

Reglas de envío:
- **Dedupe:** antes de enviar se inserta en `push_log` con `dedupe_key` única (`rem|member|chore|date`, `night|…`, `req|id|member`, `cov|overrideId`). Si hay conflicto, no se envía.
- **Headers:** `Urgency: high`, `TTL: 14400`, `Topic` corto (≤32 caracteres base64url) para colapsar repetidos.
- **Payload:** `{title, body, tag, url: '#/hoy', ack: {url: SUPABASE_URL + '/rest/v1/rpc/push_ack', key: SUPABASE_ANON_KEY}}`.
- **Al enviar:** `last_sent_at = now()` y `unconfirmed_count += 1`. Con respuesta 404 o 410, se borra la suscripción.

### 2. PWA (`src/`)
- `public/sw.js`:
  - En el evento `push`, **siempre** `event.waitUntil(showNotification(...))`. En iOS, un push sin notificación hace que se revoque la suscripción.
  - En paralelo, `fetch` a `ack.url` con body `{p_endpoint}` (obtenido de `registration.pushManager.getSubscription()`) y headers `apikey` y `Authorization: Bearer <key>`.
  - `notificationclick` enfoca o abre la URL.
  - Caché runtime stale-while-revalidate para GET del mismo origen.
- Registrar el SW en `import.meta.env.BASE_URL + 'sw.js'` con scope `BASE_URL`. Pedir el permiso solo con un botón. En cada arranque con permiso concedido: `getSubscription()` (y re-suscribir si es null), luego upsert en `push_subscriptions` on conflict endpoint, actualizando `last_seen_at`. El label se deriva del user agent ("iPhone", "Chrome en Android"…).
- **Auth y entrada:** Google OAuth (PKCE).
  - Ruta `#/unirse/:code`: guarda el código en localStorage antes del login y después llama `claim_invite`.
  - Si la casa está vacía: pantalla para crearla (`bootstrap_house`).
  - Si no hay miembro ni código: pedir el código.
- **Datos:** carga members, chores, overrides y completions desde hoy − 7 días, y los cover_requests pendientes. Suscripción realtime a esas tablas y recarga.

Pantallas (ver mockup):
- **Hoy:**
  - Progreso del día.
  - "Lo que me toca", con *Hecho* (insert en completions) y *No puedo*.
  - "Pedidos para ti", con *Acepto*: `cover_task(chore, date, requester, findReturnDate(chore, date, yo), requestId)`.
  - "Resto de la casa", con *Yo la hice*: `cover_task(..., covered = assignee, return = findReturnDate(...), p_mark_done = true)`. Si el asignado es un perfil sin cuenta y yo soy admin, el botón es *Marcar hecha* (completion simple).
  - Etiquetas *Cubierta* y *Devolución*.
- **No puedo (hoja inferior):** lista de participantes con "su próximo turno" (`findReturnDate`), *Enviar pedido a X* (`request_cover` con target) y *Pedir a cualquiera* (target null).
- **Perfil:**
  - Avatar: 12 íconos SVG propios × 6 colores, o subir foto. La foto se recorta y reduce a 128×128 WebP con canvas y se sube a `avatars/<memberId>/avatar.webp`.
  - Mis dispositivos con estado (último acuse) y botones *Probar aviso* y Guía.
  - Recordatorios por tarea (solo las tareas en las que participo): on, hora, *Insistir 20:00*.
  - 4 interruptores de cobertura.
- **Guía de avisos:** checklist para iPhone y Android. Lo detectable (standalone, `Notification.permission`) se marca solo y el resto lo marca el usuario a mano.
- **Admin · tareas:** lista con mini semana L–D e interruptor de activa. El editor tiene nombre, descripción, chips de participantes (con orden subir/bajar), modo, cuadrícula por día (Nadie / Rotativo / persona, solo entre participantes), N, días, fecha de inicio, hora sugerida y "Aplica desde".
- **Admin · miembros:**
  - Rol admin con interruptor (el trigger impide quitar el último admin).
  - Invitar: `create_invite` → código + `navigator.share` con `location.origin + BASE + '#/unirse/' + code`.
  - Perfil sin cuenta y *Quitar* (`active = false`).
  - Alerta cuando `device_health()` muestra `unconfirmed_count >= 3` y no hay acuse en 48 h.

### 3. CI y docs
- `.github/workflows/deploy.yml`: build y deploy a Pages. Las variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `VITE_VAPID_PUBLIC_KEY` salen de repo variables.
- `.github/workflows/keepalive.yml`: cron semanal que hace `POST {SUPABASE_URL}/rest/v1/rpc/ping` con la anon key.
- Íconos PNG 192/512 y `apple-touch-icon` 180 (iOS no usa SVG para la pantalla de inicio).
- README de setup:
  1. Crear el proyecto Supabase y activar el provider Google (OAuth client en Google Cloud con redirect `https://<ref>.supabase.co/auth/v1/callback`). Agregar la URL de Pages a Redirect URLs.
  2. `supabase link` y `supabase db push`.
  3. Crear los secretos de Vault.
  4. `npm run vapid` y luego `supabase secrets set VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_SUBJECT=mailto:… CRON_SECRET`.
  5. `supabase functions deploy notify --no-verify-jwt`.
  6. Configurar las variables del repo y activar Pages (source: GitHub Actions).

## Decisiones de producto ya tomadas (no re-discutir)
- **Cobertura:** A no puede y B cubre la fecha d. A paga en el siguiente turno base de B en esa misma tarea. "No puedo" y "Yo la hice por ti" usan el mismo mecanismo.
- **Participantes:** se eligen por tarea.
- **Recordatorios y alertas:** son personales, por tarea. El admin solo pone la hora sugerida.
- **Roles:** admin = gestiona tareas y miembros. Las coberturas no requieren admin.
- **Avatares:** set predeterminado o foto subida.
- **Pendiente de decidir con Aries:** qué pasa si nadie hace una tarea (¿se arrastra al día siguiente o queda como fallida?). Por ahora simplemente queda sin marcar.
