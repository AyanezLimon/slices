import { useState } from 'preact/hooks';
import { ruleFor } from '../../supabase/functions/_shared/schedule.js';
import { actions } from '../lib/house.js';
import { Avatar, Icon, Switch, Segmented, Sheet, attempt } from '../components/ui.jsx';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export function AdminTabs({ active }) {
  return (
    <div class="seg" role="tablist" aria-label="Administrar">
      <a role="tab" href="#/admin" aria-selected={active === 'tareas' ? 'true' : 'false'} class="btn" style={active === 'tareas' ? 'background:var(--superficie);color:var(--tinta);box-shadow:var(--sombra-tarjeta)' : 'color:var(--tinta-suave)'}>Tareas</a>
      <a role="tab" href="#/admin/miembros" aria-selected={active === 'miembros' ? 'true' : 'false'} class="btn" style={active === 'miembros' ? 'background:var(--superficie);color:var(--tinta);box-shadow:var(--sombra-tarjeta)' : 'color:var(--tinta-suave)'}>Miembros</a>
    </div>
  );
}

const latestRule = (chore, today) => ruleFor(chore, today) || chore.rules?.[chore.rules.length - 1] || null;

function summary(h, chore) {
  const r = latestRule(chore, h.today);
  if (!r) return 'Sin reglas';
  const names = (r.participants || []).map((id) => h.byId.get(id)?.name).filter(Boolean);
  if (r.mode === 'every_n') return `Cada ${r.n} días · ${names.join(' → ') || 'sin participantes'}`;
  if (r.mode === 'daily_rotation') return `Rotativa diaria · ${names.join(' → ') || 'sin participantes'}`;
  return chore.description || `Por día · ${names.length} participantes`;
}

export function AdminChores({ h }) {
  return (
    <main class="screen with-nav">
      <header class="row">
        <h1 class="display grow">Administrar</h1>
        <a class="btn btn-primario" href="#/admin/tarea/nueva"><Icon name="mas" size={18} />Nueva tarea</a>
      </header>
      <AdminTabs active="tareas" />
      {h.chores.length === 0 && <div class="card"><p class="muted">Todavía no hay tareas. Crea la primera con "Nueva tarea".</p></div>}
      <div class="stack" style="gap:10px">
        {h.chores.map((c) => {
          const r = latestRule(c, h.today);
          return (
            <article class="card" style={c.active ? '' : 'opacity:0.65'}>
              <div class="row" style="align-items:flex-start">
                <a href={`#/admin/tarea/${c.id}`} class="grow stack-sm" style="color:inherit;font-weight:inherit">
                  <span class="tarea">{c.name}</span>
                  <span class="meta">{c.active ? summary(h, c) : 'Pausada'}</span>
                </a>
                <Switch checked={c.active} label={`${c.name} activa`} onChange={(v) => attempt(() => actions.saveChore(c, { active: v }))} />
              </div>
              {r?.mode === 'weekly' && (
                <div class="week">
                  {SHORT.map((d, i) => {
                    const s = r.slots?.[i + 1];
                    const m = s?.fixed ? h.byId.get(s.fixed) : null;
                    const style = m ? `background:var(--persona-${m.color_index || 1});color:var(--sobre-persona)` : s?.rotate ? 'background:var(--superficie-tenue);color:var(--tinta)' : 'background:var(--fondo)';
                    return <div><span aria-hidden="true">{d}</span><span style={style} aria-label={`${DAYS[i]}: ${m ? m.name : s?.rotate ? 'rotativo' : 'nadie'}`}>{m ? m.name.charAt(0) : s?.rotate ? '↻' : ''}</span></div>;
                  })}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </main>
  );
}

export function ChoreEditor({ h, id }) {
  const chore = id && id !== 'nueva' ? h.chores.find((c) => c.id === id) : null;
  const r = chore ? latestRule(chore, h.today) : null;
  const allMembers = h.members.filter((m) => m.active);

  const [name, setName] = useState(chore?.name || '');
  const [desc, setDesc] = useState(chore?.description || '');
  const [time, setTime] = useState(String(chore?.default_time || '08:00').slice(0, 5));
  const [parts, setParts] = useState(r?.participants || allMembers.filter((m) => m.user_id).map((m) => m.id));
  const [mode, setMode] = useState(r?.mode || 'weekly');
  const [slots, setSlots] = useState(() => {
    const s = {};
    for (let d = 1; d <= 7; d++) {
      const v = r?.slots?.[d];
      s[d] = v?.fixed ? v.fixed : v?.rotate ? 'rot' : 'none';
    }
    return s;
  });
  const [n, setN] = useState(r?.n || 3);
  const [days, setDays] = useState(r?.days || [1, 2, 3, 4, 5]);
  const [start, setStart] = useState(r?.start_date || h.today);
  const [effective, setEffective] = useState(h.today);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const togglePart = (mid) => {
    if (parts.includes(mid)) {
      setParts(parts.filter((x) => x !== mid));
      setSlots(Object.fromEntries(Object.entries(slots).map(([d, v]) => [d, v === mid ? 'none' : v])));
    } else {
      setParts([...parts, mid]);
    }
  };
  const move = (i, dir) => {
    const next = [...parts];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setParts(next);
  };
  const hasRot = Object.values(slots).includes('rot');

  const save = async (e) => {
    e.preventDefault();
    if (mode !== 'weekly' && parts.length === 0) return attempt(() => Promise.reject(new Error('Marca al menos una persona.')));
    const rule = { effective_from: effective, start_date: start, mode, participants: parts };
    if (mode === 'weekly') {
      rule.slots = {};
      for (const [d, v] of Object.entries(slots)) {
        if (v === 'rot') rule.slots[d] = { rotate: true };
        else if (v !== 'none') rule.slots[d] = { fixed: v };
      }
    }
    if (mode === 'every_n') rule.n = Math.max(1, Number(n) || 1);
    if (mode === 'daily_rotation') rule.days = [...days].sort();
    const rules = (chore?.rules || []).filter((x) => x.effective_from !== effective).concat([rule])
      .sort((a, b) => (a.effective_from < b.effective_from ? -1 : 1));
    setBusy(true);
    const ok = await attempt(() => actions.saveChore(chore, { name: name.trim(), description: desc.trim() || null, default_time: time, rules }), 'Tarea guardada');
    setBusy(false);
    if (ok) location.hash = '#/admin';
  };

  return (
    <form class="screen" onSubmit={save}>
      <a href="#/admin" class="row" style="gap:4px;min-height:44px;align-self:flex-start"><Icon name="atras" size={20} />Tareas</a>
      <h1 class="titulo">{chore ? 'Editar tarea' : 'Nueva tarea'}</h1>

      <div class="card">
        <div class="field"><label for="n">Nombre</label><input id="n" class="input" value={name} onInput={(e) => setName(e.currentTarget.value)} required /></div>
        <div class="field"><label for="d">Descripción (opcional)</label><textarea id="d" class="input" rows={2} value={desc} onInput={(e) => setDesc(e.currentTarget.value)} /></div>
      </div>

      <div class="card">
        <div class="row"><span class="label grow">Participan en esta tarea</span><span class="meta" style="font-weight:700">{parts.length} de {allMembers.length}</span></div>
        <span class="meta">Solo quienes marques entran en la rotación y se pueden asignar a un día.</span>
        <div class="row-wrap">
          {allMembers.map((m) => {
            const on = parts.includes(m.id);
            return (
              <button type="button" aria-pressed={on ? 'true' : 'false'} onClick={() => togglePart(m.id)} class="row"
                style={`min-height:44px;padding:0 14px 0 6px;gap:8px;border-radius:999px;border:1.5px solid ${on ? 'var(--primario)' : 'var(--borde-control)'};background:${on ? 'var(--superficie-tenue)' : 'var(--superficie)'};font-weight:700;opacity:${on ? 1 : 0.7}`}>
                <Avatar member={m} size={32} />{m.name}{on && <Icon name="check" size={16} strokeWidth={3} />}
              </button>
            );
          })}
        </div>
      </div>

      <div class="card">
        <span class="label">Frecuencia</span>
        <Segmented label="Frecuencia" value={mode} onChange={setMode} options={[['weekly', 'Por día'], ['every_n', 'Cada N días'], ['daily_rotation', 'Diaria rotativa']]} />
        {mode === 'weekly' && (
          <div class="stack" style="gap:6px">
            <span class="meta">Elige quién hace cada día. "Rotativo" gira cada semana entre los participantes.</span>
            {DAYS.map((d, i) => (
              <div class="row">
                <label for={`s${i}`} style="width:96px;font-weight:600">{d}</label>
                <select id={`s${i}`} class="input" style="min-height:44px" value={slots[i + 1]} onChange={(e) => setSlots({ ...slots, [i + 1]: e.currentTarget.value })}>
                  <option value="none">Nadie</option>
                  <option value="rot">Rotativo</option>
                  {parts.map((pid) => <option value={pid}>{h.byId.get(pid)?.name}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}
        {mode === 'every_n' && (
          <div class="row"><label for="nn" style="font-weight:600">Cada</label><input id="nn" type="number" min="2" class="input input-sm" style="width:80px;text-align:center" value={n} onInput={(e) => setN(e.currentTarget.value)} /><span style="font-weight:600">días</span></div>
        )}
        {mode === 'daily_rotation' && (
          <div class="stack" style="gap:6px">
            <span class="meta">Qué días aplica</span>
            <div class="row-wrap">
              {SHORT.map((d, i) => {
                const on = days.includes(i + 1);
                return <button type="button" aria-pressed={on ? 'true' : 'false'} aria-label={DAYS[i]} onClick={() => setDays(on ? days.filter((x) => x !== i + 1) : [...days, i + 1])}
                  style={`width:44px;height:44px;border-radius:12px;font-weight:800;border:1.5px solid ${on ? 'var(--primario)' : 'var(--borde-control)'};background:${on ? 'var(--primario)' : 'var(--superficie)'};color:${on ? 'var(--sobre-primario)' : 'var(--tinta)'}`}>{d}</button>;
              })}
            </div>
          </div>
        )}
        {(mode !== 'weekly' || hasRot) && (
          <div class="stack" style="gap:8px">
            <span class="label">Orden de rotación</span>
            {parts.length === 0 && <span class="meta">Marca al menos una persona arriba.</span>}
            {parts.map((pid, i) => (
              <div class="tenue row" style="padding:6px 8px 6px 12px">
                <span class="meta" style="font-weight:800;width:18px">{i + 1}</span>
                <Avatar member={h.byId.get(pid)} size={28} />
                <span class="grow tarea" style="font-size:15px">{h.byId.get(pid)?.name}</span>
                <button type="button" class="btn btn-texto" style="padding:0 8px" aria-label="Subir" onClick={() => move(i, -1)} disabled={i === 0}><Icon name="arriba" size={18} /></button>
                <button type="button" class="btn btn-texto" style="padding:0 8px" aria-label="Bajar" onClick={() => move(i, 1)} disabled={i === parts.length - 1}><Icon name="abajo" size={18} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div class="card">
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">
          <div class="field"><label for="st">Inicio de rotación</label><input id="st" type="date" class="input" value={start} onInput={(e) => setStart(e.currentTarget.value)} /></div>
          <div class="field"><label for="tm">Hora sugerida</label><input id="tm" type="time" class="input" value={time} onInput={(e) => setTime(e.currentTarget.value)} /></div>
        </div>
        {chore && (
          <div class="field"><label for="ef">Los cambios aplican desde</label><input id="ef" type="date" class="input" value={effective} min={h.today} onInput={(e) => setEffective(e.currentTarget.value)} /></div>
        )}
        <div class="tenue row" style="align-items:flex-start;font-size:13px;color:var(--tinta-suave)">
          <Icon name="info" size={18} />
          <span>La hora sugerida es solo el valor inicial. Cada participante puede cambiarla o apagar su recordatorio en su Perfil.{chore ? ' Los días anteriores a "aplican desde" no cambian.' : ''}</span>
        </div>
      </div>

      <div class="stack" style="gap:8px">
        <button class="btn btn-primario" type="submit" disabled={busy || !name.trim()}>Guardar tarea</button>
        <a class="btn btn-texto" href="#/admin">Cancelar</a>
        {chore && <button class="btn btn-peligro" type="button" onClick={() => setConfirmDelete(true)} disabled={busy}>Borrar tarea</button>}
      </div>

      {confirmDelete && (
        <Sheet label="Borrar tarea" onClose={() => setConfirmDelete(false)}>
          <div class="stack-sm">
            <h2 class="titulo">¿Borrar {chore.name}?</h2>
            <p class="muted">Se borra también su historial, las coberturas y los pedidos pendientes. No se puede deshacer. Si solo quieres dejarla de lado un tiempo, mejor páusala con el interruptor en la lista de tareas.</p>
          </div>
          <button class="btn btn-peligro" type="button" disabled={busy} onClick={async () => {
            setBusy(true);
            const ok = await attempt(() => actions.deleteChore(chore.id), 'Tarea borrada');
            setBusy(false);
            setConfirmDelete(false);
            if (ok) location.hash = '#/admin';
          }}>Sí, borrarla</button>
          <button class="btn btn-texto" type="button" onClick={() => setConfirmDelete(false)}>Cancelar</button>
        </Sheet>
      )}
    </form>
  );
}
