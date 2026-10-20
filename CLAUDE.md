# Slices — contexto para Claude Code

Slices es la PWA de la familia Limón para repartir los quehaceres (un limón entero que se reparte en gajos). Costo cero. Usuarios: Santiago, Isis, Victoria, Aries
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
- `supabase/functions/notify/`: Edge Function de avisos (desplegar con `--no-verify-jwt`; `supabase/config.toml` ya lo declara).
  - `plan.js` decide qué avisar (pura, con tests en `tests/notify-plan.test.js`): recordatorios por persona y tarea con su hora (ventana de recuperación de 6 h, agrupados en un push), devoluciones aunque la tarea esté apagada si `cover.devolver`, *Insistir 20:00*, pedidos de cobertura (`mePiden` / `general`) y "te cubrieron" (`meCubren`, con fecha de devolución).
  - `index.ts` hace la E/S: `x-cron-secret` corre el ciclo; `Authorization: Bearer <jwt>` + `{test:true}` manda un aviso de prueba al miembro (CORS abierto para la PWA). Dedupe reservando `dedupe_key` en `push_log` antes de enviar; headers `Urgency: high`, `TTL: 14400`, `Topic`; borra suscripciones con 404/410.
  - Payload del push: `{title, body, tag, url: '#/hoy', ack: {url, key}}`. El SW debe mostrarlo siempre y hacer el acuse a `ack.url`.
  - Type-check: `deno check --node-modules-dir=none supabase/functions/notify/index.ts`.
- `supabase/migrations/…_cron.sql`: cron por minuto con secretos en Vault (`project_url`, `cron_secret`) y limpieza semanal.
- Mockup de las 8 pantallas: canvas de Claude Design "App de Quehaceres" (https://claude.ai/artifact/YDEQXgSx7KmND4q4nWAn9N). Úsalo para **estructura y flujo** (qué hay en cada pantalla, barra inferior Hoy / Admin / Perfil, targets ≥44px). Sus colores son los viejos: **no** los copies.
- Identidad visual: `design/tokens.json` y `design/README.md` (copia del Design System "Slices", https://claude.ai/artifact/QbyjrEMDHqUyJzNgdeBm8Y). Es la fuente de verdad de colores, tipografía, radios, espacios y sombras. Marca: https://claude.ai/artifact/NZtV1uTAu84ZU2GW5guHvu (ícono: variante 2 "Medio limón" de la fusión C+D).

## Identidad (decidida)
- Limón criollo: cáscara verde, pulpa verde clara, fondo verde bosque. Nunca limón amarillo.
- **Ícono:** media rodaja con el gajo central separado hacia arriba, sobre `icono-fondo`. Igual en claro y oscuro.
- **Medidor de la pantalla Hoy:** la media rodaja; cada tarea del día es un gajo (`pulpa` = hecha, `pendiente` = por hacer). Tu gajo pendiente sale en oscuro y un poco separado. Reemplaza la barra de progreso del mockup.
- **Tipografía:** Fraunces (logotipo "Slices", saludo y títulos de pantalla/hoja) y Plus Jakarta Sans para todo lo demás. Ambas de Google Fonts.
- **Tema:** cada persona elige en Perfil *Sistema* (por defecto), *Claro* u *Oscuro*; se guarda en `member_prefs.theme` (`system|light|dark`) y también en localStorage para pintar antes de cargar datos. La app pone `data-theme="light|dark"` en `<html>` solo si la persona eligió uno; con *Sistema* manda `prefers-color-scheme`. Genera variables CSS desde `design/tokens.json` (un `:root` con el tema claro, `[data-theme=dark]` y `@media (prefers-color-scheme: dark) :root:not([data-theme=light])` con el oscuro).
- **Color de persona:** `members.color` es un índice 1–5 que apunta a `persona-1…5`.
- **Voz:** de tú, corta, sin regaños ("Hoy te toca", "Isis te cubrió"). Ver `design/README.md`.

## Lo que FALTA (en este orden)

### 1. PWA (`src/`)
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
  - Tema: Sistema / Claro / Oscuro.
- **Guía de avisos:** checklist para iPhone y Android. Lo detectable (standalone, `Notification.permission`) se marca solo y el resto lo marca el usuario a mano.
- **Admin · tareas:** lista con mini semana L–D e interruptor de activa. El editor tiene nombre, descripción, chips de participantes (con orden subir/bajar), modo, cuadrícula por día (Nadie / Rotativo / persona, solo entre participantes), N, días, fecha de inicio, hora sugerida y "Aplica desde".
- **Admin · miembros:**
  - Rol admin con interruptor (el trigger impide quitar el último admin).
  - Invitar: `create_invite` → código + `navigator.share` con `location.origin + BASE + '#/unirse/' + code`.
  - Perfil sin cuenta y *Quitar* (`active = false`).
  - Alerta cuando `device_health()` muestra `unconfirmed_count >= 3` y no hay acuse en 48 h.

### 2. CI y docs
- `.github/workflows/deploy.yml`: build y deploy a Pages. Las variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y `VITE_VAPID_PUBLIC_KEY` salen de repo variables.
- `.github/workflows/keepalive.yml`: cron semanal que hace `POST {SUPABASE_URL}/rest/v1/rpc/ping` con la anon key.
- Íconos PNG 192/512 (`any`), 512 maskable (rodaja dentro del 80 % central) y `apple-touch-icon` 180 (iOS no usa SVG para la pantalla de inicio). Se generan desde el SVG del ícono (variante 2).
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
