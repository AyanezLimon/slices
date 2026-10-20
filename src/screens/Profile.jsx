import { useEffect, useState, useRef } from 'preact/hooks';
import { supabase, must } from '../lib/supabase.js';
import { actions, participantsOf } from '../lib/house.js';
import { applyTheme } from '../lib/theme.js';
import { enablePush, sendTest, currentEndpoint, permission } from '../lib/push.js';
import { CURRENT_VERSION, checkForUpdate, applyUpdate } from '../lib/updates.js';
import { Avatar, AVATAR_ICONS, Icon, Switch, Segmented, attempt, toast } from '../components/ui.jsx';

const ago = (ts) => {
  if (!ts) return null;
  const min = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (min < 2) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const hrs = Math.round(min / 60);
  if (hrs < 48) return `hace ${hrs} h`;
  return `hace ${Math.round(hrs / 24)} días`;
};

const COVER_PREFS = [
  ['meCubren', 'Cuando alguien cubre una tarea mía', 'Quién la hizo y qué turno te toca devolver'],
  ['mePiden', 'Cuando me piden cubrir a mí', 'Pedidos para ti o de tareas en las que participas'],
  ['devolver', 'El día que me toca devolver', 'Se suma al recordatorio de esa tarea'],
  ['general', 'Cualquier pedido abierto en la casa', 'También de tareas en las que no participas'],
  ['actualizaciones', 'Nuevas versiones de Slices', 'Un aviso cuando la app se actualiza']
];

export function Profile({ h }) {
  const [endpoint, setEndpoint] = useState(null);
  const [busy, setBusy] = useState(false);
  const prefs = h.prefs;
  const saveTimer = useRef(null);
  const [choresPrefs, setChoresPrefs] = useState(prefs.chores || {});

  useEffect(() => { currentEndpoint().then(setEndpoint); }, [h.devices.length]);
  useEffect(() => setChoresPrefs(prefs.chores || {}), [prefs.chores]);

  const mineChores = h.chores.filter((c) => c.active && participantsOf(c, h.today).includes(h.me.id));
  const thisDevice = h.devices.find((d) => d.endpoint === endpoint);

  const setTheme = (t) => { applyTheme(t); attempt(() => actions.savePrefs(h, { theme: t })); };
  const setCover = (k, val) => attempt(() => actions.savePrefs(h, { cover: { ...prefs.cover, [k]: val } }));
  const setChore = (id, patch, chore) => {
    const next = { ...choresPrefs, [id]: { on: true, time: String(chore.default_time).slice(0, 5), insist: false, ...choresPrefs[id], ...patch } };
    setChoresPrefs(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => attempt(() => actions.savePrefs(h, { chores: next })), 500);
  };

  const enable = async () => {
    setBusy(true);
    await attempt(async () => { await enablePush(h.me.id); setEndpoint(await currentEndpoint()); h.reload(); }, 'Avisos activados en este dispositivo');
    setBusy(false);
  };
  const test = async () => {
    setBusy(true);
    await attempt(() => sendTest(), 'Prueba enviada. Bloquea el celular y espera unos segundos.');
    setBusy(false);
  };
  const lookForUpdate = async () => {
    const v = await checkForUpdate();
    if (v) applyUpdate(); else toast('Ya tienes la versión más reciente');
  };

  return (
    <main class="screen with-nav">
      <header class="row" style="gap:14px">
        <Avatar member={h.me} size={56} />
        <div class="grow stack-sm">
          <h1 class="titulo">{h.me.name}</h1>
          <span class="meta">{h.isAdmin ? 'Administrador' : 'Miembro'} · {h.devices.length} {h.devices.length === 1 ? 'dispositivo' : 'dispositivos'}</span>
          <a href="#/perfil/foto" style="font-size:14px">Cambiar foto</a>
        </div>
      </header>

      <section class="stack">
        <h2 class="seccion">Tema</h2>
        <Segmented label="Tema de la app" value={prefs.theme || 'system'} onChange={setTheme}
          options={[['system', 'Sistema'], ['light', 'Claro'], ['dark', 'Oscuro']]} />
        <span class="meta">{(prefs.theme || 'system') === 'system' ? 'Sigue el modo claro u oscuro de tu teléfono.' : 'Se aplica en todos tus dispositivos.'}</span>
      </section>

      <section class="stack">
        <h2 class="seccion">Mis dispositivos</h2>
        <div class="card list">
          {h.devices.length === 0 && <div class="list-row"><span class="meta">Ningún dispositivo recibe avisos todavía.</span></div>}
          {h.devices.map((d) => {
            const warn = d.unconfirmed_count >= 3;
            return (
              <div class="list-row">
                <span style="color:var(--tinta-suave)"><Icon name={/Mac|Windows/.test(d.label || '') ? 'laptop' : 'telefono'} /></span>
                <div class="grow stack-sm">
                  <span class="tarea" style="font-size:15px">{d.label || 'Dispositivo'}{d.endpoint === endpoint ? ' · este' : ''}</span>
                  <span class="meta" style={warn ? 'color:var(--aviso);font-weight:700' : ''}>
                    {warn ? `${d.unconfirmed_count} avisos sin confirmar` : d.last_receipt_at ? `Último aviso recibido ${ago(d.last_receipt_at)}` : 'Aún no recibe avisos'}
                  </span>
                </div>
                {d.endpoint !== endpoint && (
                  <button class="btn btn-texto" type="button" onClick={() => attempt(() => actions.removeDevice(d.id).then(h.reload), 'Dispositivo quitado')}>Quitar</button>
                )}
              </div>
            );
          })}
        </div>
        <div class="btn-row">
          {thisDevice && permission() === 'granted'
            ? <button class="btn btn-primario" type="button" onClick={test} disabled={busy}>Probar aviso</button>
            : <button class="btn btn-primario" type="button" onClick={enable} disabled={busy}>Activar avisos aquí</button>}
          <a class="btn btn-secundario" href="#/guia">Guía de avisos</a>
        </div>
      </section>

      <section class="stack">
        <div class="stack-sm">
          <h2 class="seccion">Mis recordatorios por tarea</h2>
          <span class="meta">Solo suenan los días que te toca esa tarea.</span>
        </div>
        <div class="card list">
          {mineChores.length === 0 && <div class="list-row"><span class="meta">No participas en ninguna tarea todavía.</span></div>}
          {mineChores.map((c) => {
            const p = { on: true, time: String(c.default_time).slice(0, 5), insist: false, ...choresPrefs[c.id] };
            return (
              <div class="list-row" style="flex-direction:column;align-items:stretch;gap:10px">
                <div class="row">
                  <div class="grow stack-sm">
                    <span class="tarea" style={`font-size:15px;color:${p.on ? 'var(--tinta)' : 'var(--tinta-suave)'}`}>{c.name}</span>
                    <span class="meta">{p.on ? `Aviso a las ${p.time}` : 'Recordatorio apagado'}</span>
                  </div>
                  <Switch checked={p.on} label={`Recordatorio de ${c.name}`} onChange={(v) => setChore(c.id, { on: v }, c)} />
                </div>
                {p.on && (
                  <div class="row-wrap">
                    <label class="tenue row" style="padding:4px 6px 4px 12px;gap:8px;font-size:13px;font-weight:700;color:var(--tinta-suave)">
                      Hora
                      <input type="time" class="input input-sm" value={p.time} onChange={(e) => setChore(c.id, { time: e.currentTarget.value }, c)} />
                    </label>
                    <button type="button" class="btn btn-secundario" style="min-height:44px;font-size:13px" aria-pressed={p.insist ? 'true' : 'false'}
                      onClick={() => setChore(c.id, { insist: !p.insist }, c)}>
                      {p.insist ? '✓ ' : ''}Insistir 20:00 si falta
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section class="stack">
        <h2 class="seccion">Coberturas y novedades</h2>
        <div class="card list">
          {COVER_PREFS.map(([k, title, sub]) => (
            <div class="list-row">
              <div class="grow stack-sm">
                <span class="tarea" style="font-size:15px">{title}</span>
                <span class="meta">{sub}</span>
              </div>
              <Switch checked={Boolean(prefs.cover[k])} label={title} onChange={(v) => setCover(k, v)} />
            </div>
          ))}
        </div>
      </section>

      <section class="stack" style="align-items:center;text-align:center">
        <span class="meta">Slices {CURRENT_VERSION}</span>
        <div class="row-wrap" style="justify-content:center">
          <button class="btn btn-texto" type="button" onClick={lookForUpdate}>Buscar actualización</button>
          <button class="btn btn-texto" type="button" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
        </div>
      </section>
    </main>
  );
}

// ───────────── Foto de perfil ─────────────

async function resizeToWebp(file) {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  canvas.getContext('2d').drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 128, 128);
  return new Promise((res) => canvas.toBlob(res, 'image/webp', 0.85));
}

export function AvatarPicker({ h }) {
  const [tab, setTab] = useState(h.me.avatar?.type === 'photo' ? 'photo' : 'icon');
  const [icon, setIcon] = useState(h.me.avatar?.icon || 'sol');
  const [color, setColor] = useState(h.me.color_index || 1);
  const [busy, setBusy] = useState(false);
  const preview = { ...h.me, color_index: color, avatar: tab === 'icon' ? { type: 'icon', icon } : h.me.avatar };

  const save = async () => {
    setBusy(true);
    await attempt(() => actions.updateMember(h.me.id, { color_index: color, ...(tab === 'icon' ? { avatar: { type: 'icon', icon } } : {}) }), 'Foto guardada');
    setBusy(false);
    location.hash = '#/perfil';
  };

  const upload = async (e) => {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    setBusy(true);
    await attempt(async () => {
      const blob = await resizeToWebp(file);
      const path = `${h.me.id}/avatar.webp`;
      must(await supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: blob.type || 'image/webp' }));
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      await actions.updateMember(h.me.id, { avatar: { type: 'photo', url: `${data.publicUrl}?v=${Date.now()}` }, color_index: color });
      h.reload();
    }, 'Foto actualizada');
    setBusy(false);
  };

  return (
    <main class="screen">
      <a href="#/perfil" class="row" style="gap:4px;min-height:44px;align-self:flex-start"><Icon name="atras" size={20} />Perfil</a>
      <h1 class="titulo">Foto de perfil</h1>
      <div class="stack" style="align-items:center"><Avatar member={preview} size={112} /><span class="tarea">{h.me.name}</span></div>
      <Segmented label="Tipo de foto" value={tab} onChange={setTab} options={[['icon', 'Avatares'], ['photo', 'Subir foto']]} />
      {tab === 'icon' ? (
        <div class="card">
          <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px">
            {Object.keys(AVATAR_ICONS).map((k) => (
              <button type="button" aria-label={`Avatar ${k}`} aria-pressed={icon === k ? 'true' : 'false'} onClick={() => setIcon(k)}
                style={`aspect-ratio:1;border-radius:50%;border:3px solid ${icon === k ? 'var(--tinta)' : 'transparent'};background:var(--persona-${color});color:var(--sobre-persona);display:flex;align-items:center;justify-content:center;padding:0`}>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={AVATAR_ICONS[k]} /></svg>
              </button>
            ))}
          </div>
          <span class="label">Color</span>
          <div class="row-wrap">
            {[1, 2, 3, 4, 5].map((i) => (
              <button type="button" aria-label={`Color ${i}`} aria-pressed={color === i ? 'true' : 'false'} onClick={() => setColor(i)}
                style={`width:44px;height:44px;border-radius:50%;padding:0;border:3px solid ${color === i ? 'var(--tinta)' : 'var(--superficie)'};background:var(--persona-${i})`} />
            ))}
          </div>
        </div>
      ) : (
        <div class="card">
          <label class="btn btn-primario" style="position:relative">
            <Icon name="galeria" size={20} />{busy ? 'Subiendo…' : 'Elegir foto'}
            <input type="file" accept="image/*" onChange={upload} style="position:absolute;inset:0;opacity:0" disabled={busy} />
          </label>
          <p class="meta">Se recorta en círculo y se guarda pequeña (128 px) para que cargue rápido.</p>
        </div>
      )}
      {tab === 'icon' && <button class="btn btn-primario" type="button" onClick={save} disabled={busy}>Guardar</button>}
    </main>
  );
}
