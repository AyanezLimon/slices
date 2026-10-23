import { useEffect, useState, useCallback, useRef } from 'preact/hooks';
import { supabase, must } from './supabase.js';
import { toast } from '../components/ui.jsx';

const HISTORY_DAYS = 90; // lo comprado en este lapso alimenta "Lo de siempre"
export const norm = (s) => s.trim().toLocaleLowerCase('es');

/**
 * Lista de compras con Realtime. Los cambios propios se ven al instante (optimistas):
 * si la escritura falla se avisa y se recarga lo que hay en la base.
 */
export function useShopping(meId) {
  const [items, setItems] = useState(null);
  const inflight = useRef(0);
  const dirty = useRef(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    if (!meId) return;
    if (inflight.current > 0) { dirty.current = true; return; } // no pisar un cambio que va en camino
    const since = new Date(Date.now() - HISTORY_DAYS * 864e5).toISOString();
    try {
      const rows = must(await supabase.from('shopping_items').select('*')
        .or(`bought_at.is.null,bought_at.gte.${since}`).order('added_at', { ascending: false }));
      if (inflight.current > 0) dirty.current = true;
      else setItems(rows);
    } catch (e) {
      setItems((s) => s || []);
    }
  }, [meId]);

  useEffect(() => {
    if (!meId) return undefined;
    load();
    const reload = () => { clearTimeout(timer.current); timer.current = setTimeout(load, 250); };
    const ch = supabase.channel('compras')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items' }, reload)
      .subscribe();
    const onVisible = () => { if (document.visibilityState === 'visible') reload(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { supabase.removeChannel(ch); document.removeEventListener('visibilitychange', onVisible); };
  }, [meId, load]);

  const run = useCallback(async (local, remote) => {
    inflight.current += 1;
    setItems((s) => local(s || []));
    try {
      must(await remote());
    } catch (e) {
      toast(e.message || 'No se pudo guardar');
      dirty.current = true;
    } finally {
      inflight.current -= 1;
      if (inflight.current === 0 && dirty.current) { dirty.current = false; load(); }
    }
  }, [load]);

  const patch = (id, p) => run(
    (s) => s.map((x) => (x.id === id ? { ...x, ...p } : x)),
    () => supabase.from('shopping_items').update(p).eq('id', id)
  );

  const actions = {
    add: (name, owner, note) => {
      const row = { id: crypto.randomUUID(), name: name.trim(), note: note || null, owner: owner || null };
      return run(
        (s) => [{ ...row, added_by: meId, added_at: new Date().toISOString(), bought_by: null, bought_at: null }, ...s],
        () => supabase.from('shopping_items').insert({ ...row, added_by: meId })
      );
    },
    buy: (item) => patch(item.id, { bought_at: new Date().toISOString(), bought_by: meId }),
    unbuy: (item) => patch(item.id, { bought_at: null, bought_by: null }),
    update: (item, p) => patch(item.id, p),
    remove: (item) => run(
      (s) => s.filter((x) => x.id !== item.id),
      () => supabase.from('shopping_items').delete().eq('id', item.id)
    )
  };

  return { items, actions, loading: items === null };
}

/** Separa una lista (casa u owner) en pendientes, compradas hoy y sugerencias. */
export function shoppingView(items, owner) {
  const list = (items || []).filter((x) => (x.owner || null) === (owner || null));
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const pending = list.filter((x) => !x.bought_at);
  const boughtToday = list.filter((x) => x.bought_at && new Date(x.bought_at) >= start)
    .sort((a, b) => b.bought_at.localeCompare(a.bought_at));
  const open = new Set(pending.map((x) => norm(x.name)));
  const skip = new Set([...open, ...boughtToday.map((x) => norm(x.name))]); // lo recién comprado no se sugiere
  const freq = new Map();
  for (const x of list) {
    if (!x.bought_at) continue;
    const k = norm(x.name);
    const f = freq.get(k) || { name: x.name, count: 0, last: '' };
    f.count += 1;
    if (x.bought_at > f.last) { f.last = x.bought_at; f.name = x.name; }
    freq.set(k, f);
  }
  const usual = [...freq.entries()].filter(([k]) => !skip.has(k))
    .sort((a, b) => b[1].count - a[1].count || b[1].last.localeCompare(a[1].last))
    .slice(0, 8).map(([, f]) => f);
  return { pending, boughtToday, usual, open };
}

/** Veces que se compró algo con ese nombre en la lista (para la hoja). */
export function timesBought(items, item) {
  const k = norm(item.name);
  return (items || []).filter((x) => x.bought_at && (x.owner || null) === (item.owner || null) && norm(x.name) === k).length;
}
