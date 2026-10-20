// Actualizaciones: cada release publica una version.json nueva.
// - Al volver a la app (o al abrirla) se revisa la versión. Si cambió y la persona aún no tocó nada,
//   se recarga en silencio. Si ya estaba usándola, aparece un aviso "Actualizar" y se aplica sola
//   la próxima vez que la app pase a segundo plano y vuelva.
const listeners = new Set();
let available = null;
let pendingOnReturn = false;
let registration = null;

export const CURRENT_VERSION = __APP_VERSION__;

export function onUpdate(fn) {
  listeners.add(fn);
  fn(available);
  return () => listeners.delete(fn);
}

function setAvailable(v) {
  available = v;
  listeners.forEach((fn) => fn(v));
}

export function applyUpdate() {
  location.reload();
}

export async function checkForUpdate() {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const { version } = await res.json();
    if (version && version !== CURRENT_VERSION) {
      registration?.update().catch(() => {});
      return version;
    }
  } catch (e) { /* sin red */ }
  return null;
}

export function startUpdates() {
  if (import.meta.env.DEV) return;
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .then((reg) => { registration = reg; })
      .catch((e) => console.warn('SW', e));
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.type === 'open' && e.data.url) {
        const hash = new URL(e.data.url).hash;
        if (hash) location.hash = hash;
      }
    });
  }

  let visibleAt = Date.now();
  let touched = false;
  const touch = () => { touched = true; };
  addEventListener('pointerdown', touch, { passive: true });
  addEventListener('keydown', touch);

  const check = async () => {
    const v = await checkForUpdate();
    if (!v) return;
    if (!touched && Date.now() - visibleAt < 6000) applyUpdate();
    else { setAvailable(v); pendingOnReturn = true; }
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (pendingOnReturn) return applyUpdate();
      visibleAt = Date.now();
      touched = false;
      check();
    }
  });
  setInterval(() => { if (document.visibilityState === 'visible') check(); }, 30 * 60 * 1000);
  check();
}
