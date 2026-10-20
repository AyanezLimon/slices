// Slices · Edge Function "notify"
// - Cron (header x-cron-secret): recordatorios por persona y tarea, insistencia 20:00,
//   pedidos de cobertura y "te cubrieron". body {run:"release", version, notes} = aviso de actualización.
// - Usuario con sesión (Authorization: Bearer <jwt>): aviso de prueba a sus dispositivos.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';
import { nowIn, dutiesOn, indexOverrides, ruleFor, addDays, DEFAULT_TZ } from '../_shared/schedule.js';
import { relDate, listJoin } from '../_shared/format.js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';
const TZ = Deno.env.get('HOUSE_TZ') ?? DEFAULT_TZ;
const CATCH_UP_MIN = 6 * 60;
const NIGHT = '20:00';

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!
);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

type Payload = { title: string; body: string; tag: string; url?: string };
type Prefs = { chores: Record<string, { on?: boolean; time?: string; insist?: boolean }>; cover: Record<string, boolean> };
const DEFAULT_COVER = { meCubren: true, mePiden: true, devolver: true, general: false, actualizaciones: true };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const body = await req.json().catch(() => ({}));
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  if (CRON_SECRET && req.headers.get('x-cron-secret') === CRON_SECRET) {
    try {
      if (body.run === 'release') return json(await releaseNotice(db, String(body.version ?? ''), String(body.notes ?? '')));
      if (body.run === 'setup') {
        const { error } = await db.from('app_config').upsert([
          { key: 'project_url', value: SUPABASE_URL, updated_at: new Date().toISOString() },
          { key: 'cron_secret', value: CRON_SECRET, updated_at: new Date().toISOString() }
        ]);
        return json(error ? { error: error.message } : { ok: true });
      }
      return json(await cycle(db));
    } catch (e) {
      console.error(e);
      return json({ error: String(e) }, 500);
    }
  }

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth } = await db.auth.getUser(jwt);
  if (!auth?.user) return json({ error: 'No autorizado' }, 401);
  const { data: me } = await db.from('members').select('id').eq('user_id', auth.user.id).eq('active', true).maybeSingle();
  if (!me) return json({ error: 'No eres miembro de la casa' }, 403);
  const r = await send(db, me.id, [`test|${me.id}|${Date.now()}`], 'test', {
    title: 'Slices',
    body: 'Aviso de prueba. Si lo ves con el celular bloqueado, todo está bien.',
    tag: 'test'
  });
  return json(r);
});

// ───────────────────────── Envío ─────────────────────────

/** Reserva claves de dedupe; devuelve solo las que este proceso ganó. */
async function claim(db: SupabaseClient, memberId: string, keys: string[], kind: string) {
  if (!keys.length) return [];
  const { data, error } = await db
    .from('push_log')
    .upsert(keys.map((k) => ({ dedupe_key: k, member_id: memberId, kind })), { onConflict: 'dedupe_key', ignoreDuplicates: true })
    .select('dedupe_key');
  if (error) throw error;
  return (data ?? []).map((r) => r.dedupe_key as string);
}

function topicFor(tag: string) {
  return tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || 'slices';
}

async function deliver(db: SupabaseClient, memberId: string, payload: Payload) {
  const { data: subs } = await db.from('push_subscriptions').select('*').eq('member_id', memberId);
  let delivered = 0, failed = 0;
  const message = JSON.stringify({
    ...payload,
    url: payload.url ?? '#/hoy',
    ack: { url: `${SUPABASE_URL}/rest/v1/rpc/push_ack`, key: ANON_KEY }
  });
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        message,
        { TTL: 4 * 3600, urgency: 'high', topic: topicFor(payload.tag) }
      );
      delivered++;
      await db.from('push_subscriptions')
        .update({ last_sent_at: new Date().toISOString(), unconfirmed_count: (s.unconfirmed_count ?? 0) + 1 })
        .eq('id', s.id);
    } catch (e) {
      failed++;
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db.from('push_subscriptions').delete().eq('id', s.id);
      else console.error('push error', code, String(e));
    }
  }
  return { delivered, failed };
}

async function send(db: SupabaseClient, memberId: string, keys: string[], kind: string, payload: Payload) {
  const won = await claim(db, memberId, keys, kind);
  if (!won.length) return { skipped: true };
  const r = await deliver(db, memberId, payload);
  await db.from('push_log').update({ payload, delivered: r.delivered, failed: r.failed }).in('dedupe_key', won);
  return { ...r, keys: won };
}

// ───────────────────────── Ciclo por minuto ─────────────────────────

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

async function cycle(db: SupabaseClient) {
  const { date, time } = nowIn(TZ);
  const [members, chores, overrides, completions, prefsRows, requests, coverOv, subs] = await Promise.all([
    db.from('members').select('id,name,active').eq('active', true),
    db.from('chores').select('*').eq('active', true),
    db.from('overrides').select('*').gte('date', addDays(date, -1)),
    db.from('completions').select('chore_id,date').eq('date', date),
    db.from('member_prefs').select('*'),
    db.from('cover_requests').select('*').eq('status', 'pending').is('notified_at', null),
    db.from('overrides').select('*').eq('reason', 'cubre').is('notified_at', null),
    db.from('push_subscriptions').select('member_id')
  ]);
  for (const r of [members, chores, overrides, completions, prefsRows, requests, coverOv, subs]) if (r.error) throw r.error;

  const names = new Map((members.data ?? []).map((m) => [m.id, m.name as string]));
  const choreById = new Map((chores.data ?? []).map((c) => [c.id, c]));
  const withDevices = new Set((subs.data ?? []).map((s) => s.member_id as string));
  const prefs = new Map<string, Prefs>((prefsRows.data ?? []).map((p) => [p.member_id, { chores: p.chores ?? {}, cover: { ...DEFAULT_COVER, ...(p.cover ?? {}) } }]));
  const prefOf = (id: string): Prefs => prefs.get(id) ?? { chores: {}, cover: DEFAULT_COVER };
  const done = new Set((completions.data ?? []).map((c) => c.chore_id as string));
  const ov = indexOverrides(overrides.data ?? []);
  const duties = dutiesOn(chores.data ?? [], date, ov);
  const now = minutes(time);
  const out: Record<string, unknown> = { date, time };

  // 1 y 2. Recordatorios e insistencia
  let reminders = 0;
  for (const memberId of withDevices) {
    if (!names.has(memberId)) continue;
    const p = prefOf(memberId);
    const mine = duties.filter((d) => d.assignee === memberId && !done.has(d.chore.id));
    const dueKeys: string[] = [], dueNames: string[] = [], nightKeys: string[] = [], nightNames: string[] = [];
    for (const d of mine) {
      const cp = p.chores[d.chore.id] ?? {};
      const isReturn = d.override?.reason === 'devuelve';
      const on = cp.on ?? true;
      const at = (cp.time ?? String(d.chore.default_time)).slice(0, 5);
      if ((on || (isReturn && p.cover.devolver)) && minutes(at) <= now && now - minutes(at) <= CATCH_UP_MIN) {
        dueKeys.push(`rem|${memberId}|${d.chore.id}|${date}`);
        dueNames.push(isReturn ? `${d.chore.name} (devolución)` : d.chore.name);
      }
      if (on && cp.insist && time >= NIGHT) {
        nightKeys.push(`night|${memberId}|${d.chore.id}|${date}`);
        nightNames.push(d.chore.name);
      }
    }
    if (dueKeys.length) {
      const won = await claim(db, memberId, dueKeys, 'reminder');
      if (won.length) {
        const list = dueNames.filter((_, i) => won.includes(dueKeys[i]));
        const r = await deliver(db, memberId, { title: 'Hoy te toca', body: listJoin(list), tag: `rem-${date}` });
        await db.from('push_log').update({ delivered: r.delivered, failed: r.failed }).in('dedupe_key', won);
        reminders++;
      }
    }
    if (nightKeys.length) {
      const won = await claim(db, memberId, nightKeys, 'night');
      if (won.length) {
        const list = nightNames.filter((_, i) => won.includes(nightKeys[i]));
        await deliver(db, memberId, { title: 'Todavía te falta', body: listJoin(list), tag: `night-${date}` });
        reminders++;
      }
    }
  }
  out.reminders = reminders;

  // 3. Pedidos de cobertura
  let reqs = 0;
  for (const r of requests.data ?? []) {
    const chore = choreById.get(r.chore_id);
    const requester = names.get(r.requester) ?? 'Alguien';
    let recipients: string[];
    if (r.target) {
      recipients = prefOf(r.target).cover.mePiden ? [r.target] : [];
    } else {
      // Pedido abierto: avisa a quienes participan en la tarea (como el panel de Hoy),
      // y a los demás solo si activaron "Cualquier pedido abierto en la casa".
      const rule = chore ? ruleFor(chore, r.date) : null;
      const parts = new Set<string>(rule?.participants ?? [...names.keys()]);
      recipients = [...names.keys()].filter((id) => id !== r.requester &&
        (parts.has(id) ? prefOf(id).cover.mePiden : prefOf(id).cover.general));
    }
    for (const id of recipients) {
      await send(db, id, [`req|${r.id}|${id}`], 'cover_request', {
        title: `${requester} no puede con ${chore?.name ?? 'una tarea'}`,
        body: `¿La cubres ${relDate(r.date, date)}? Luego te devuelve un turno.`,
        tag: `req-${r.id.slice(0, 8)}`
      });
    }
    await db.from('cover_requests').update({ notified_at: new Date().toISOString() }).eq('id', r.id);
    reqs++;
  }
  out.requests = reqs;

  // 4. "Te cubrieron"
  let covered = 0;
  for (const o of coverOv.data ?? []) {
    if (o.covered_member && prefOf(o.covered_member).cover.meCubren) {
      const chore = choreById.get(o.chore_id);
      const back = (overrides.data ?? []).find((x) => x.pair_id === o.pair_id && x.reason === 'devuelve')
        ?? (await db.from('overrides').select('date').eq('pair_id', o.pair_id).eq('reason', 'devuelve').maybeSingle()).data;
      const who = names.get(o.assignee) ?? 'Alguien';
      await send(db, o.covered_member, [`cov|${o.id}`], 'covered', {
        title: `${who} te cubrió`,
        body: back ? `${chore?.name ?? 'Tu tarea'} ${relDate(o.date, date)}. Te toca su turno ${relDate(back.date, date)}.` : `${chore?.name ?? 'Tu tarea'} ${relDate(o.date, date)}.`,
        tag: `cov-${o.id.slice(0, 8)}`
      });
    }
    await db.from('overrides').update({ notified_at: new Date().toISOString() }).eq('id', o.id);
    covered++;
  }
  out.covered = covered;
  return out;
}

// ───────────────────────── Aviso de nueva versión ─────────────────────────

async function releaseNotice(db: SupabaseClient, version: string, notes: string) {
  if (!version) return { error: 'Falta version' };
  const { data: members } = await db.from('members').select('id').eq('active', true);
  const { data: prefsRows } = await db.from('member_prefs').select('member_id,cover');
  const off = new Set((prefsRows ?? []).filter((p) => p.cover?.actualizaciones === false).map((p) => p.member_id));
  const firstLine = notes.split('\n').map((l) => l.replace(/^[#*\-\s]+/, '').trim()).find(Boolean) ?? '';
  let sent = 0;
  for (const m of members ?? []) {
    if (off.has(m.id)) continue;
    const r = await send(db, m.id, [`rel|${version}|${m.id}`], 'release', {
      title: `Slices se actualizó a ${version}`,
      body: firstLine ? `${firstLine.slice(0, 120)} · Ábrela para usarla.` : 'Ábrela para usar la versión nueva.',
      tag: 'release'
    });
    if (!('skipped' in r)) sent++;
  }
  return { version, sent };
}
