// Qué avisos tocan en este minuto. Puro (sin red ni base de datos) para poder probarlo
// con vitest; index.ts hace la E/S, el dedupe en push_log y el envío.
//
// Cada aviso candidato es { memberId, key, kind, ... }. `key` es la dedupe_key de push_log:
// si ya existe, ese aviso ya salió y no se repite.

import { dutiesOn, indexOverrides, ruleFor, weekdayOf, addDays } from '../_shared/schedule.js';

export const CATCHUP_MIN = 6 * 60; // un recordatorio atrasado se recupera hasta 6 h después
export const INSIST_AT = '20:00';
export const COVER_MAX_AGE_MS = 24 * 3600 * 1000; // coberturas más viejas se marcan sin avisar

const DEFAULT_COVER = { meCubren: true, mePiden: true, devolver: true, general: false };
const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

export const hhmm = (t) => String(t || '08:00').slice(0, 5);
const toMin = (t) => {
  const [h, m] = hhmm(t).split(':').map(Number);
  return h * 60 + m;
};

export function coverPrefs(prefs) {
  return { ...DEFAULT_COVER, ...(prefs?.cover || {}) };
}

export function chorePref(prefs, chore) {
  const p = { on: true, time: chore.default_time, insist: false, ...(prefs?.chores?.[chore.id] || {}) };
  return { ...p, time: hhmm(p.time) };
}

/** "hoy", "mañana" o "el martes 27". */
export function fechaHumana(date, today) {
  if (date === today) return 'hoy';
  if (date === addDays(today, 1)) return 'mañana';
  return `el ${DIAS[weekdayOf(date) - 1]} ${Number(date.slice(8))}`;
}

/** "a", "a y b", "a, b y c" */
export function listaEs(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

/**
 * Recordatorios del día y el "Insistir 20:00".
 * ctx: { today, now: 'HH:MM', chores, overrides, completions, prefsByMember: Map, eligible: Set }
 * eligible = miembros activos con al menos un dispositivo suscrito.
 */
export function planReminders({ today, now, chores, overrides, completions, prefsByMember, eligible }) {
  const ovIdx = indexOverrides(overrides);
  const done = new Set(completions.filter((c) => c.date === today).map((c) => c.chore_id));
  const nowMin = toMin(now);
  const out = [];

  for (const d of dutiesOn(chores, today, ovIdx)) {
    if (!eligible.has(d.assignee) || done.has(d.chore.id)) continue;
    const prefs = prefsByMember.get(d.assignee);
    const pref = chorePref(prefs, d.chore);
    const isReturn = d.override?.reason === 'devuelve';
    if (!pref.on && !(isReturn && coverPrefs(prefs).devolver)) continue;

    const base = { memberId: d.assignee, chore: d.chore, returnTo: isReturn ? d.override.covered_member : null };
    const t = toMin(pref.time);
    if (nowMin >= t && nowMin - t <= CATCHUP_MIN) {
      out.push({ ...base, kind: 'rem', key: `rem|${d.assignee}|${d.chore.id}|${today}` });
    }
    if (pref.on && pref.insist && nowMin >= toMin(INSIST_AT)) {
      out.push({ ...base, kind: 'night', key: `night|${d.assignee}|${d.chore.id}|${today}` });
    }
  }
  return out;
}

/** Junta los recordatorios de una persona en un solo push por tipo. */
export function reminderMessages(items, membersById, today) {
  const groups = new Map();
  for (const it of items) {
    const g = `${it.memberId}|${it.kind}`;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(it);
  }
  const out = [];
  for (const list of groups.values()) {
    const { memberId, kind } = list[0];
    const names = list.map((it) => {
      const to = it.returnTo && membersById.get(it.returnTo);
      return to ? `${it.chore.name} (le devuelves el turno a ${to.name})` : it.chore.name;
    });
    const day = today.replaceAll('-', '');
    out.push({
      memberId,
      keys: list.map((it) => it.key),
      kind,
      title: kind === 'rem' ? 'Hoy te toca' : 'Te falta',
      body: listaEs(names),
      tag: `${kind}-${day}`
    });
  }
  return out;
}

/**
 * Pedidos de cobertura sin avisar. Devuelve los mensajes y los ids a marcar notified_at
 * (todos los revisados, aunque nadie quiera el aviso, para no revisarlos cada minuto).
 */
export function planCoverRequests({ today, requests, chores, membersById, prefsByMember, eligible }) {
  const choresById = new Map(chores.map((c) => [c.id, c]));
  const messages = [];
  const markIds = [];

  for (const r of requests) {
    markIds.push(r.id);
    const chore = choresById.get(r.chore_id);
    const requester = membersById.get(r.requester);
    if (!chore || !requester || r.date < today) continue;

    let recipients;
    if (r.target) {
      recipients = coverPrefs(prefsByMember.get(r.target)).mePiden ? [r.target] : [];
    } else {
      const parts = ruleFor(chore, r.date)?.participants || [];
      recipients = parts.filter((id) => id !== r.requester && coverPrefs(prefsByMember.get(id)).general);
    }

    const cuando = fechaHumana(r.date, today);
    for (const memberId of recipients) {
      if (!eligible.has(memberId) || !membersById.has(memberId)) continue;
      messages.push({
        memberId,
        keys: [`req|${r.id}|${memberId}`],
        kind: 'req',
        title: r.target ? '¿Puedes cubrir?' : 'Pedido de cobertura',
        body: `${requester.name} no puede con ${chore.name} ${cuando}. ${r.target ? '¿La cubres?' : '¿Quién cubre?'}`,
        tag: `req-${r.id.slice(0, 8)}`
      });
    }
  }
  return { messages, markIds };
}

/**
 * "Te cubrieron": overrides 'cubre' sin avisar. `returns` mapea pair_id → fecha de devolución.
 */
export function planCovered({ today, nowMs, covers, returns, chores, membersById, prefsByMember, eligible }) {
  const choresById = new Map(chores.map((c) => [c.id, c]));
  const messages = [];
  const markIds = [];

  for (const o of covers) {
    markIds.push(o.id);
    const chore = choresById.get(o.chore_id);
    const who = membersById.get(o.assignee);
    const covered = o.covered_member;
    if (!chore || !who || !covered || !membersById.has(covered)) continue;
    if (nowMs - Date.parse(o.created_at) > COVER_MAX_AGE_MS) continue;
    if (!eligible.has(covered) || !coverPrefs(prefsByMember.get(covered)).meCubren) continue;

    const ret = o.pair_id ? returns.get(o.pair_id) : null;
    const body = `${who.name} cubrió ${chore.name} ${fechaHumana(o.date, today)}.` +
      (ret ? ` Le devuelves el turno ${fechaHumana(ret, today)}.` : '');
    messages.push({
      memberId: covered,
      keys: [`cov|${o.id}`],
      kind: 'cov',
      title: `${who.name} te cubrió`,
      body,
      tag: `cov-${o.id.slice(0, 8)}`
    });
  }
  return { messages, markIds };
}
