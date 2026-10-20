import { supabase, VAPID_PUBLIC_KEY, must } from './supabase.js';

export const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

export const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const permission = () => ('Notification' in window ? Notification.permission : 'unsupported');

export function deviceLabel() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/Android/.test(ua)) return /SamsungBrowser/.test(ua) ? 'Samsung Internet en Android' : 'Chrome en Android';
  if (/Mac/.test(ua)) return 'Navegador en Mac';
  if (/Windows/.test(ua)) return 'Navegador en Windows';
  return 'Navegador';
}

function keyBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Registra (o re-registra) este dispositivo para el miembro. Llamar en cada arranque. */
export async function syncSubscription(memberId) {
  if (!pushSupported() || Notification.permission !== 'granted' || !VAPID_PUBLIC_KEY) return null;
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
  const j = sub.toJSON();
  must(await supabase.from('push_subscriptions').upsert({
    member_id: memberId,
    endpoint: j.endpoint,
    p256dh: j.keys.p256dh,
    auth: j.keys.auth,
    label: deviceLabel(),
    last_seen_at: new Date().toISOString()
  }, { onConflict: 'endpoint' }));
  return j.endpoint;
}

export async function enablePush(memberId) {
  if (!pushSupported()) {
    throw new Error(isIOS() && !isStandalone()
      ? 'En iPhone primero agrega Slices a la pantalla de inicio y ábrela desde ahí.'
      : 'Este navegador no soporta avisos.');
  }
  const p = await Notification.requestPermission();
  if (p !== 'granted') throw new Error('Los avisos quedaron bloqueados. Actívalos en los ajustes del teléfono.');
  return syncSubscription(memberId);
}

export async function currentEndpoint() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub?.endpoint || null;
}

export async function sendTest() {
  const { data, error } = await supabase.functions.invoke('notify', { body: { test: true } });
  if (error) throw new Error(error.message || 'No se pudo enviar la prueba');
  if (data?.delivered === 0) throw new Error('Ningún dispositivo recibió la prueba. Activa los avisos en este celular.');
  return data;
}
