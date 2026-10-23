import { useState } from 'preact/hooks';
import { shoppingView, timesBought, norm } from '../lib/shopping.js';
import { Avatar, Icon, Sheet, Segmented, toast } from '../components/ui.jsx';

const TAB_KEY = 'slices-compras-lista';
const hhmm = (ts) => new Date(ts).toLocaleTimeString('es-CR', { hour: 'numeric', minute: '2-digit' });
const ago = (ts) => {
  const min = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (min < 2) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.round(hrs / 24);
  return days === 1 ? 'ayer' : `hace ${days} días`;
};
const plural = (n, one, many) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

export function Shopping({ h, shop }) {
  const [tab, setTab] = useState(() => { try { return localStorage.getItem(TAB_KEY) || 'casa'; } catch (e) { return 'casa'; } });
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(null);
  const mine = tab === 'mias';
  const owner = mine ? h.me.id : null;
  const v = shoppingView(shop.items, owner);
  const counts = { casa: shoppingView(shop.items, null).pending.length, mias: shoppingView(shop.items, h.me.id).pending.length };
  const name = (id) => h.byId.get(id)?.name || 'Alguien';

  const pickTab = (t) => { setTab(t); setDraft(''); try { localStorage.setItem(TAB_KEY, t); } catch (e) { /* */ } };
  const add = (text) => {
    const t = (text || '').trim();
    if (!t) return;
    setDraft('');
    if (v.open.has(norm(t))) { toast(`${t} ya está en la lista`); return; }
    shop.actions.add(t.charAt(0).toLocaleUpperCase('es') + t.slice(1), owner);
  };

  const n = v.pending.length;
  const eyebrow = n === 0 ? 'Nada pendiente' : mine ? plural(n, 'cosa tuya', 'cosas tuyas') : plural(n, 'cosa por comprar', 'cosas por comprar');

  return (
    <main class="screen with-nav ancha compras">
      <header class="stack-sm">
        <span class="eyebrow">{eyebrow}</span>
        <h1 class="display">Compras</h1>
      </header>

      <div class="compras-listas stack">
        <Segmented label="Lista" value={tab} onChange={pickTab}
          options={[['casa', `De la casa · ${counts.casa}`], ['mias', `Mías · ${counts.mias}`]]} />
        {mine && (
          <div class="tenue row" style="padding:10px 12px;gap:10px">
            <Icon name="candado" size={18} />
            <span class="meta" style="color:var(--tinta)">Solo tú ves esta lista.</span>
          </div>
        )}
      </div>

      {/* En el celular las dos columnas se deshacen (display: contents) y el orden lo da `order`. */}
      <div class="compras-principal">
        <form class="row compras-agregar" style="gap:8px" onSubmit={(e) => { e.preventDefault(); add(draft); }}>
          <label for="compra-nueva" class="sr-only">{mine ? 'Qué necesitas tú' : 'Qué se acabó'}</label>
          <input id="compra-nueva" class="input grow" value={draft} maxLength={80} autocomplete="off"
            placeholder={mine ? '¿Qué necesitas tú?' : '¿Qué se acabó?'} onInput={(e) => setDraft(e.currentTarget.value)} />
          <button class="btn btn-primario" type="submit" style="min-height:48px"><Icon name="mas" size={20} strokeWidth={2.5} />Agregar</button>
        </form>

        <section class="stack compras-pendientes">
          <h2 class="seccion">Por comprar</h2>
          {shop.loading
            ? <div class="card" style="align-items:center"><div class="spinner" aria-label="Cargando" /></div>
            : n === 0
              ? <div class="card"><p class="muted">{mine ? 'No tienes nada pendiente.' : 'No falta nada. Casa surtida.'}</p></div>
              : (
                <div class="card list">
                  {v.pending.map((it) => (
                    <div class="list-row">
                      <button type="button" class="check" onClick={() => shop.actions.buy(it)} aria-label={`Marcar ${it.name} como comprado`} />
                      <button type="button" class="grow stack-sm compra-texto" onClick={() => setEditing(it)} aria-label={`${it.name}: nota y opciones`}>
                        <span class="tarea">{it.name}</span>
                        <span class="meta">{[it.note, mine ? null : name(it.added_by), ago(it.added_at)].filter(Boolean).join(' · ')}</span>
                      </button>
                      {!mine && <Avatar member={h.byId.get(it.added_by)} size={28} />}
                    </div>
                  ))}
                </div>
              )}
        </section>
      </div>

      <div class="compras-lado">
        {v.usual.length > 0 && (
          <section class="stack compras-siempre">
            <h2 class="label">Lo de siempre</h2>
            <div class="row-wrap">
              {v.usual.map((u) => (
                <button type="button" class="chip-btn" onClick={() => add(u.name)} aria-label={`Agregar ${u.name}`}>
                  <span style="color:var(--cascara);display:flex"><Icon name="mas" size={18} strokeWidth={2.5} /></span>{u.name}
                </button>
              ))}
            </div>
          </section>
        )}

        {v.boughtToday.length > 0 && (
          <section class="stack compras-hechas">
            <h2 class="seccion">Ya comprado</h2>
            <div class="card list">
              {v.boughtToday.map((it) => (
                <div class="list-row">
                  <button type="button" class="check on" onClick={() => shop.actions.unbuy(it)} aria-label={`Desmarcar ${it.name}`}>
                    <Icon name="check" size={22} strokeWidth={3} />
                  </button>
                  <div class="grow stack-sm">
                    <span class="tarea strike">{it.name}</span>
                    <span class="meta">{mine ? `Comprado a las ${hhmm(it.bought_at)}` : `${it.bought_by === h.me.id ? 'Lo compraste tú' : `Lo compró ${name(it.bought_by)}`} · ${hhmm(it.bought_at)}`}</span>
                  </div>
                </div>
              ))}
            </div>
            <span class="meta">Lo comprado se va de la lista mañana y queda en «Lo de siempre».</span>
          </section>
        )}
      </div>

      {editing && <ItemSheet h={h} shop={shop} item={editing} onClose={() => setEditing(null)} />}
    </main>
  );
}

function ItemSheet({ h, shop, item, onClose }) {
  const [note, setNote] = useState(item.note || '');
  const mine = Boolean(item.owner);
  const times = timesBought(shop.items, item);
  const who = h.byId.get(item.added_by);
  const done = (fn) => { fn(); onClose(); };
  const save = () => done(() => {
    const n = note.trim() || null;
    if (n !== (item.note || null)) shop.actions.update(item, { note: n });
  });

  return (
    <Sheet label={item.name} onClose={onClose}>
      <div class="stack-sm">
        <h2 class="titulo">{item.name}</h2>
        {!mine && who && (
          <div class="row" style="gap:8px">
            <Avatar member={who} size={24} />
            <span class="meta">{who.id === h.me.id ? 'Lo agregaste tú' : `Lo agregó ${who.name}`}</span>
          </div>
        )}
      </div>
      <form class="field" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <label for="compra-nota">Nota (cantidad, marca, dónde)</label>
        <input id="compra-nota" class="input" value={note} maxLength={140} onInput={(e) => setNote(e.currentTarget.value)} />
      </form>
      {times > 0 && (
        <div class="tenue row" style="align-items:flex-start">
          <Icon name="rotar" size={20} />
          <p style="font-size:14px">{times === 1 ? 'Se ha comprado 1 vez' : `Se ha comprado ${times} veces`} en los últimos 3 meses.</p>
        </div>
      )}
      <div class="hoja-acciones">
        <button class="btn btn-primario" type="button" onClick={save}>Guardar</button>
        <button class="btn btn-secundario" type="button"
          onClick={() => done(() => { shop.actions.update(item, { owner: mine ? null : h.me.id, note: note.trim() || null }); toast(mine ? 'Pasó a la lista de la casa' : 'Pasó a tus cosas'); })}>
          {mine ? 'Pasar a la casa' : 'Pasar a mis cosas'}
        </button>
        <button class="btn btn-secundario" type="button" onClick={() => done(() => shop.actions.remove(item))}>Quitar de la lista</button>
        <button class="btn btn-texto" type="button" onClick={onClose}>Cancelar</button>
      </div>
    </Sheet>
  );
}
