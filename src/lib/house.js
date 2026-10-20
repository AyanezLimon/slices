import { useEffect, useState, useCallback, useRef } from 'preact/hooks';
import { supabase, must } from './supabase.js';
import {
  todayIn, addDays, indexOverrides, dutiesOn, findReturnDate, ruleFor, weekdayOf
} from '../../supabase/functions/_shared/schedule.js';

export const DEFAULT_COVER = { meCubren: true, mePiden: true, devolver: true, general: false, actualizaciones: true };
export const ckey = (choreId, date) => `${choreId}|${date}`;

/** Todo el estado de la casa, con recarga en tiempo real. */
export function useHouse(session) {
  const [state, setState] = useState({ loading: true });
  const timer = useRef(null);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const meId = must(await supabase.rpc('current_member_id'));
      if (!meId) {
        const exists = must(await supabase.rpc('house_exists'));
        setState({ loading: false, notMember: true, houseExists: exists });
        return;
      }
      const today = todayIn();
      const since = addDays(today, -7);
      const [members, chores, overrides, completions, requests, prefs, devices] = await Promise.all([
        supabase.from('members').select('*').order('created_at'),
        supabase.from('chores').select('*').order('sort').order('created_at'),
        supabase.from('overrides').select('*').gte('date', since),
        supabase.from('completions').select('*').gte('date', since),
        supabase.from('cover_requests').select('*').eq('status', 'pending').gte('date', today),
        supabase.rpc('ensure_my_prefs'),
        supabase.from('push_subscriptions').select('*').order('created_at')
      ]);
      const ms = must(members);
      const me = ms.find((m) => m.id === meId);
      const done = new Map(must(completions).map((c) => [ckey(c.chore_id, c.date), c]));
      const ovList = must(overrides);
      setState({
        loading: false,
        today,
        me,
        isAdmin: me?.role === 'admin',
        members: ms,
        active: ms.filter((m) => m.active),
        byId: new Map(ms.map((m) => [m.id, m])),
        chores: must(chores),
        overrides: ovList,
        ov: indexOverrides(ovList),
        done,
        requests: must(requests),
        prefs: { ...must(prefs), cover: { ...DEFAULT_COVER, ...(must(prefs)?.cover || {}) } },
        devices: must(devices)
      });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e.message }));
    }
  }, [session]);

  useEffect(() => {
    if (!session) return undefined;
    load();
    const reload = () => { clearTimeout(timer.current); timer.current = setTimeout(load, 250); };
    const ch = supabase.channel('casa');
    for (const t of ['members', 'chores', 'overrides', 'completions', 'cover_requests']) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, reload);
    }
    ch.subscribe();
    const onVisible = () => { if (document.visibilityState === 'visible') reload(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { supabase.removeChannel(ch); document.removeEventListener('visibilitychange', onVisible); };
  }, [session, load]);

  // Refleja al instante un cambio de preferencias (no llega por Realtime).
  const patchPrefs = useCallback((patch) => setState((s) => ({ ...s, prefs: { ...s.prefs, ...patch } })), []);

  return { ...state, reload: load, patchPrefs };
}

// ───────────── Derivados ─────────────

export function todayView(h) {
  const activeChores = h.chores.filter((c) => c.active);
  const duties = dutiesOn(activeChores, h.today, h.ov).map((d) => ({ ...d, completion: h.done.get(ckey(d.chore.id, h.today)) || null }));
  const mine = duties.filter((d) => d.assignee === h.me.id);
  const others = duties.filter((d) => d.assignee !== h.me.id);
  const forMe = h.requests.filter((r) => {
    if (r.requester === h.me.id) return false;
    if (r.target) return r.target === h.me.id;
    const c = h.chores.find((x) => x.id === r.chore_id);
    const rule = c && ruleFor(c, r.date);
    return !rule || (rule.participants || []).includes(h.me.id);
  });
  const mySent = new Map(h.requests.filter((r) => r.requester === h.me.id).map((r) => [ckey(r.chore_id, r.date), r]));
  return { duties, mine, others, forMe, mySent };
}

export function participantsOf(chore, date) {
  const r = ruleFor(chore, date) || chore.rules?.[chore.rules.length - 1];
  if (!r) return [];
  const set = new Set(r.participants || []);
  if (r.mode === 'weekly') for (const s of Object.values(r.slots || {})) if (s?.fixed) set.add(s.fixed);
  return [...set];
}

export function ruleMeta(chore, date) {
  const r = ruleFor(chore, date);
  if (!r) return '';
  if (r.mode === 'weekly') {
    const slot = r.slots?.[weekdayOf(date)];
    return slot?.rotate ? 'Este día rota cada semana' : 'Tu día fijo';
  }
  if (r.mode === 'every_n') return `Cada ${r.n} días`;
  return 'Rotativa diaria';
}

export function returnFor(h, chore, date, coverer) {
  return findReturnDate(chore, date, coverer, h.ov);
}

// ───────────── Acciones ─────────────

export const actions = {
  markDone: async (h, choreId, date) =>
    must(await supabase.from('completions').insert({ chore_id: choreId, date, done_by: h.me.id })),
  undoDone: async (choreId, date) =>
    must(await supabase.from('completions').delete().eq('chore_id', choreId).eq('date', date)),
  requestCover: async (choreId, date, target) =>
    must(await supabase.rpc('request_cover', { p_chore: choreId, p_date: date, p_target: target || null })),
  cancelRequest: async (id) => must(await supabase.rpc('cancel_cover_request', { p_id: id })),
  coverTask: async ({ choreId, date, covered, returnDate, requestId, markDone }) =>
    must(await supabase.rpc('cover_task', {
      p_chore: choreId, p_date: date, p_covered: covered, p_return_date: returnDate || null,
      p_request: requestId || null, p_mark_done: Boolean(markDone)
    })),
  savePrefs: async (h, patch) => {
    const before = h.prefs;
    h.patchPrefs(patch);
    try {
      must(await supabase.from('member_prefs').update({ ...patch, updated_at: new Date().toISOString() }).eq('member_id', h.me.id));
    } catch (e) {
      h.patchPrefs(before);
      throw e;
    }
  },
  updateMember: async (id, patch) => must(await supabase.from('members').update(patch).eq('id', id)),
  addMember: async (name, colorIndex) => must(await supabase.from('members').insert({ name, color_index: colorIndex }).select().single()),
  createInvite: async (memberId) => must(await supabase.rpc('create_invite', { p_member: memberId })),
  deviceHealth: async () => must(await supabase.rpc('device_health')),
  removeDevice: async (id) => must(await supabase.from('push_subscriptions').delete().eq('id', id)),
  saveChore: async (chore, patch) => {
    if (chore?.id) return must(await supabase.from('chores').update(patch).eq('id', chore.id).select().single());
    return must(await supabase.from('chores').insert(patch).select().single());
  }
};
