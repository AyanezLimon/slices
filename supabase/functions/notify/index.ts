// Edge Function "notify": la llama pg_cron cada minuto (header x-cron-secret) y la PWA
// para "Probar aviso" (Authorization: Bearer <jwt> + body {test:true}).
// Se despliega con --no-verify-jwt: la autenticación la hace esta función.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
// @deno-types="npm:@types/web-push@3.6.4"
import webpush from 'npm:web-push@3.6.7';
import { DEFAULT_TZ, nowIn, addDays } from '../_shared/schedule.js';
import { planReminders, reminderMessages, planCoverRequests, planCovered } from './plan.js';

const env = (k: string) => {
  const v = Deno.env.get(k);
  if (!v) throw new Error(`Falta la variable ${k}`);
  return v;
};

const SUPABASE_URL = env('SUPABASE_URL');
const ANON_KEY = env('SUPABASE_ANON_KEY');
const CRON_SECRET = env('CRON_SECRET');
const db = createClient(SUPABASE_URL, env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

type Sub = { id: string; member_id: string; endpoint: string; p256dh: string; auth: string; unconfirmed_count: number };
type Message = { memberId: string; keys: string[]; kind: string; title: string; body: string; tag: string };

// Topic: ≤32 caracteres del alfabeto base64url. Colapsa avisos repetidos con la misma etiqueta.
const topicOf = (tag: string) => tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);

async function sendToMember(subs: Sub[], msg: Omit<Message, 'keys' | 'memberId' | 'kind'>) {
  const payload = JSON.stringify({
    title: msg.title,
    body: msg.body,
    tag: msg.tag,
    url: '#/hoy',
    ack: { url: `${SUPABASE_URL}/rest/v1/rpc/push_ack`, key: ANON_KEY }
  });
  let delivered = 0, failed = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        { TTL: 14400, urgency: 'high', topic: topicOf(msg.tag) }
      );
      delivered++;
      s.unconfirmed_count += 1;
      await db.from('push_subscriptions')
        .update({ last_sent_at: new Date().toISOString(), unconfirmed_count: s.unconfirmed_count })
        .eq('id', s.id);
    } catch (e) {
      failed++;
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        await db.from('push_subscriptions').delete().eq('id', s.id);
      } else {
        console.error('push falló', code, (e as Error).message);
      }
    }
  }));
  return { delivered, failed };
}

/** Reserva dedupe_keys en push_log y devuelve las que no existían (las que sí hay que enviar). */
async function reserve(rows: { member_id: string; dedupe_key: string; kind: string }[]) {
  if (!rows.length) return new Set<string>();
  const { data, error } = await db.from('push_log')
    .upsert(rows, { onConflict: 'dedupe_key', ignoreDuplicates: true })
    .select('dedupe_key');
  if (error) { console.error('push_log', error.message); return new Set<string>(); }
  return new Set(data.map((r) => r.dedupe_key));
}

async function deliver(msg: Message, subsByMember: Map<string, Sub[]>) {
  const res = await sendToMember(subsByMember.get(msg.memberId) || [], msg);
  await db.from('push_log')
    .update({ ...res, payload: { title: msg.title, body: msg.body } })
    .in('dedupe_key', msg.keys);
  return res.delivered;
}

async function runCycle() {
  const nowMs = Date.now();
  const { date: today, time: now } = nowIn(DEFAULT_TZ, new Date(nowMs));

  const [members, chores, overrides, completions, prefs, subs, requests, covers] = await Promise.all([
    db.from('members').select('id, name').eq('active', true),
    db.from('chores').select('id, name, active, default_time, rules').eq('active', true),
    db.from('overrides').select('id, chore_id, date, assignee, covered_member, reason, pair_id').gte('date', addDays(today, -1)),
    db.from('completions').select('chore_id, date').eq('date', today),
    db.from('member_prefs').select('member_id, chores, cover'),
    db.from('push_subscriptions').select('id, member_id, endpoint, p256dh, auth, unconfirmed_count'),
    db.from('cover_requests').select('id, chore_id, date, requester, target').eq('status', 'pending').is('notified_at', null),
    db.from('overrides').select('id, chore_id, date, assignee, covered_member, pair_id, created_at').eq('reason', 'cubre').is('notified_at', null)
  ]);
  for (const r of [members, chores, overrides, completions, prefs, subs, requests, covers]) {
    if (r.error) throw new Error(r.error.message);
  }

  const membersById = new Map(members.data!.map((m) => [m.id, m]));
  const prefsByMember = new Map(prefs.data!.map((p) => [p.member_id, p]));
  const subsByMember = new Map<string, Sub[]>();
  for (const s of subs.data as Sub[]) {
    if (!membersById.has(s.member_id)) continue;
    if (!subsByMember.has(s.member_id)) subsByMember.set(s.member_id, []);
    subsByMember.get(s.member_id)!.push(s);
  }
  const eligible = new Set(subsByMember.keys());

  // Devoluciones de las coberturas pendientes de avisar (pueden caer más allá de mañana).
  const pairIds = covers.data!.map((o) => o.pair_id).filter(Boolean);
  const returns = new Map<string, string>();
  if (pairIds.length) {
    const { data, error } = await db.from('overrides').select('pair_id, date').eq('reason', 'devuelve').in('pair_id', pairIds);
    if (error) throw new Error(error.message);
    for (const r of data) returns.set(r.pair_id, r.date);
  }

  const ctx = { today, chores: chores.data!, membersById, prefsByMember, eligible };
  let sent = 0;

  // Recordatorios: se reserva cada (persona, tarea) y se agrupa solo lo que no había salido.
  const items = planReminders({ ...ctx, now, overrides: overrides.data!, completions: completions.data! });
  const fresh = await reserve(items.map((it) => ({ member_id: it.memberId, dedupe_key: it.key, kind: it.kind })));
  for (const msg of reminderMessages(items.filter((it) => fresh.has(it.key)), membersById, today)) {
    sent += await deliver(msg as Message, subsByMember);
  }

  const reqPlan = planCoverRequests({ ...ctx, requests: requests.data! });
  const covPlan = planCovered({ ...ctx, nowMs, covers: covers.data!, returns });
  for (const msg of [...reqPlan.messages, ...covPlan.messages] as Message[]) {
    const ok = await reserve(msg.keys.map((k) => ({ member_id: msg.memberId, dedupe_key: k, kind: msg.kind })));
    if (ok.size) sent += await deliver(msg, subsByMember);
  }

  const stamp = new Date(nowMs).toISOString();
  if (reqPlan.markIds.length) await db.from('cover_requests').update({ notified_at: stamp }).in('id', reqPlan.markIds);
  if (covPlan.markIds.length) await db.from('overrides').update({ notified_at: stamp }).in('id', covPlan.markIds);

  return { today, now, sent };
}

async function runTest(req: Request) {
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: auth, error } = await db.auth.getUser(jwt);
  if (error || !auth.user) return json({ error: 'Sesión inválida' }, 401);

  const { data: member } = await db.from('members').select('id').eq('user_id', auth.user.id).eq('active', true).maybeSingle();
  if (!member) return json({ error: 'No eres miembro de la casa' }, 403);

  const { data: subs } = await db.from('push_subscriptions')
    .select('id, member_id, endpoint, p256dh, auth, unconfirmed_count').eq('member_id', member.id);
  if (!subs?.length) return json({ error: 'No hay dispositivos con avisos activados' }, 404);

  const res = await sendToMember(subs as Sub[], { title: 'Slices', body: 'Así te van a llegar los avisos.', tag: 'test' });
  await db.from('push_log').insert({
    member_id: member.id, dedupe_key: `test|${member.id}|${Date.now()}`, kind: 'test', ...res
  });
  return json(res);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Solo POST' }, 405);
  try {
    if (req.headers.get('x-cron-secret') === CRON_SECRET) return json(await runCycle());
    const body = await req.json().catch(() => ({}));
    if (body?.test === true && req.headers.get('Authorization')) return await runTest(req);
    return json({ error: 'No autorizado' }, 401);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
