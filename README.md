# Slices

La app de quehaceres de la casa Limón: **lo que me toca hoy**, coberturas con devolución automática y recordatorios en el celular. PWA instalable en iPhone y Android, a costo cero.

- **App**: Vite + Preact, publicada en GitHub Pages.
- **Backend**: Supabase (Postgres con RLS, login con Google, tiempo real, fotos de perfil).
- **Avisos**: Web Push (VAPID). `pg_cron` llama cada minuto a la Edge Function `notify`.
- **Diseño**: Design System "Slices" en Claude Design (limón criollo, temas claro y oscuro).

## Publicar una versión nueva

1. Haz tus cambios en un PR. CI corre los tests y el build.
2. Al mergearlo a `main`, el workflow **Auto release** crea solo el release `vX.Y.Z`. La descripción del PR puede traer dos líneas opcionales:
   - `Aviso: <texto>`: la primera línea de las notas y el texto del aviso a la casa. Si falta, se usa el título del PR.
   - `Versión: mayor | menor | parche | ninguna`: cuánto sube la versión. Si falta, sube el parche; con `ninguna` no se publica nada.

   También puedes publicar a mano como antes (**Releases → Draft a new release**); la primera línea de las notas es el aviso.
3. Al publicarse, el workflow **Release**:
   - prueba y construye la app con esa versión;
   - aplica las migraciones y despliega la Edge Function en Supabase;
   - publica en GitHub Pages;
   - avisa a la casa: "Slices se actualizó a vX.Y.Z" (cada quien puede apagarlo en su Perfil).

En los celulares:

- **App cerrada:** la próxima vez que se abre, carga la versión nueva sola.
- **App en segundo plano:** al volver a ella revisa `version.json` y, si cambió, se recarga en silencio antes de que la toques.
- **App en uso:** si ya la estabas usando, aparece "Hay una versión nueva · Actualizar", y se aplica sola la próxima vez que salgas y vuelvas.

## Configuración (una sola vez)

### Variables del repo (Settings → Secrets and variables → Actions)

| Tipo | Nombre | Valor |
|---|---|---|
| Variable | `SUPABASE_URL` | `https://<ref>.supabase.co` |
| Variable | `SUPABASE_ANON_KEY` | anon key del proyecto (pública) |
| Variable | `SUPABASE_PROJECT_REF` | `<ref>` |
| Variable | `VAPID_PUBLIC_KEY` | clave pública VAPID |
| Variable | `VAPID_SUBJECT` | `mailto:tu-correo` |
| Secret | `VAPID_PRIVATE_KEY` | clave privada VAPID (`npx web-push generate-vapid-keys`) |
| Secret | `CRON_SECRET` | texto aleatorio largo |
| Secret | `SUPABASE_ACCESS_TOKEN` | supabase.com → Account → Access Tokens |
| Secret | `SUPABASE_DB_PASSWORD` | la contraseña de la base que elegiste al crear el proyecto |

### Supabase

1. **Authentication → Providers → Google**: activa y pega el Client ID y Secret de Google Cloud.
2. **Authentication → URL Configuration**: *Site URL* = `https://<usuario>.github.io/slices/` y agrega esa misma URL en *Redirect URLs*.

### Google Cloud

1. APIs & Services → OAuth consent screen: tipo *External*, nombre "Slices" y agrega los correos de la familia como *test users* (o publica la app).
2. Credentials → Create credentials → OAuth client ID → *Web application*.
   - Authorized JavaScript origins: `https://<usuario>.github.io`
   - Authorized redirect URIs: `https://<ref>.supabase.co/auth/v1/callback`

### GitHub Pages

Settings → Pages → Source: **GitHub Actions**. En Settings → Environments → `github-pages`, permite despliegues desde tags `v*`.

## Primer uso

1. Abre la app, entra con Google y crea la casa. Quedas como administrador.
2. Admin → Miembros → **Agregar**: cada persona recibe un enlace de invitación (48 h, un solo uso).
3. Admin → Tareas → **Nueva tarea**.
4. Cada quien: Perfil → **Activar avisos aquí**. En iPhone, primero hay que agregar la app a la pantalla de inicio.

## Desarrollo

```bash
npm install
npm test                       # lógica de rotación
VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... npm run dev
node scripts/icons.mjs         # regenera los PNG de los íconos
```

La lógica de rotación vive en `supabase/functions/_shared/schedule.js` y la usan la app y la función. Más contexto en `CLAUDE.md`.
