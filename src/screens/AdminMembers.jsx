import { useEffect, useState } from 'preact/hooks';
import { actions } from '../lib/house.js';
import { APP_URL } from '../lib/supabase.js';
import { Avatar, Icon, Switch, Sheet, attempt, toast } from '../components/ui.jsx';
import { AdminTabs } from './AdminChores.jsx';

export function AdminMembers({ h }) {
  const [open, setOpen] = useState(null);
  const [invite, setInvite] = useState(null); // {member, code}
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [health, setHealth] = useState([]);

  useEffect(() => { actions.deviceHealth().then(setHealth).catch(() => {}); }, [h.members.length]);

  const silent = h.active.filter((m) => {
    const devs = health.filter((d) => d.member_id === m.id);
    if (!devs.length) return false;
    const twoDays = Date.now() - 48 * 3600 * 1000;
    return devs.every((d) => d.unconfirmed_count >= 3 && (!d.last_receipt_at || new Date(d.last_receipt_at).getTime() < twoDays));
  });

  const status = (m) => {
    if (!m.user_id) return 'Sin cuenta · un admin marca sus tareas';
    const devs = health.filter((d) => d.member_id === m.id);
    if (silent.includes(m)) return 'Avisos sin confirmar';
    return devs.length ? `Cuenta vinculada · ${devs.length} ${devs.length === 1 ? 'dispositivo' : 'dispositivos'}` : 'Cuenta vinculada · sin avisos';
  };

  const makeInvite = async (m) => {
    const code = await attempt(() => actions.createInvite(m.id));
    if (code) setInvite({ member: m, code });
  };
  const link = invite ? `${APP_URL()}#/unirse/${invite.code}` : '';
  const share = async () => {
    const text = `Únete a la casa en Slices: ${link} (código ${invite.code})`;
    if (navigator.share) { try { await navigator.share({ title: 'Slices', text, url: link }); return; } catch (e) { return; } }
    try { await navigator.clipboard.writeText(text); toast('Enlace copiado'); } catch (e) { toast(link); }
  };

  return (
    <main class="screen with-nav">
      <header class="row">
        <h1 class="display grow">Administrar</h1>
        <button class="btn btn-primario" type="button" onClick={() => setAdding(true)}><Icon name="mas" size={18} />Agregar</button>
      </header>
      <AdminTabs active="miembros" />

      {silent.map((m) => (
        <div class="alert" role="alert">
          <Icon name="campana" size={22} />
          <div class="stack-sm">
            <strong>Los avisos de {m.name} no están llegando</strong>
            <span style="font-size:13px">Pídele que abra Perfil → Guía de avisos y toque "Probar con el celular bloqueado".</span>
          </div>
        </div>
      ))}

      <div class="stack" style="gap:8px">
        {h.active.map((m) => {
          const expanded = open === m.id;
          const isLastAdmin = m.role === 'admin' && h.active.filter((x) => x.role === 'admin').length === 1;
          return (
            <div class="card" style="padding:0;gap:0">
              <button type="button" class="row" aria-expanded={expanded ? 'true' : 'false'} onClick={() => setOpen(expanded ? null : m.id)}
                style="border:none;background:transparent;padding:12px 16px;min-height:64px;text-align:left;width:100%">
                <Avatar member={m} size={44} />
                <span class="grow stack-sm">
                  <span class="row" style="gap:8px"><span class="tarea">{m.name}</span>{m.role === 'admin' && <span class="chip chip-admin">ADMIN</span>}</span>
                  <span class="meta" style={silent.includes(m) ? 'color:var(--aviso);font-weight:700' : ''}>{status(m)}</span>
                </span>
                <span style={`transform:${expanded ? 'rotate(-90deg)' : 'rotate(180deg)'};display:flex;color:var(--tinta-suave)`}><Icon name="atras" size={18} /></span>
              </button>
              {expanded && (
                <div class="stack" style="padding:12px 16px 16px;border-top:1px solid var(--linea)">
                  <div class="row">
                    <span class="grow stack-sm"><span class="tarea" style="font-size:15px">Es administrador</span><span class="meta">Puede crear tareas y gestionar miembros</span></span>
                    <Switch checked={m.role === 'admin'} label="Es administrador" disabled={isLastAdmin || !m.user_id}
                      onChange={(v) => attempt(() => actions.updateMember(m.id, { role: v ? 'admin' : 'member' }))} />
                  </div>
                  {isLastAdmin && <div class="alert" style="padding:8px 10px;font-size:13px">Debe quedar al menos un administrador.</div>}
                  <div class="btn-row">
                    {!m.user_id && <button class="btn btn-secundario" type="button" onClick={() => makeInvite(m)}>Invitar</button>}
                    {m.id !== h.me.id && <button class="btn btn-peligro" type="button" disabled={isLastAdmin} onClick={() => setRemoving(m)}>Quitar</button>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {adding && <AddMember h={h} onClose={() => setAdding(false)} onInvite={(m) => { setAdding(false); makeInvite(m); }} />}

      {invite && (
        <Sheet label="Invitar a la casa" onClose={() => setInvite(null)}>
          <div class="stack-sm">
            <h2 class="titulo">Invitar a {invite.member.name}</h2>
            <p class="muted">Quien abra el enlace inicia sesión con Google y queda unido a la casa como {invite.member.name}.</p>
          </div>
          <div class="tenue stack-sm" style="align-items:center;padding:16px">
            <span class="eyebrow">Código</span>
            <span style="font-size:34px;font-weight:800;letter-spacing:0.12em">{invite.code}</span>
            <span class="meta">Vence en 48 h · un solo uso</span>
          </div>
          <button class="btn btn-primario" type="button" onClick={share}><Icon name="compartir" size={20} />Compartir enlace</button>
          <button class="btn btn-texto" type="button" onClick={() => setInvite(null)}>Cerrar</button>
        </Sheet>
      )}

      {removing && (
        <Sheet label="Quitar miembro" onClose={() => setRemoving(null)}>
          <h2 class="titulo">¿Quitar a {removing.name}?</h2>
          <p class="muted">Deja de aparecer en la casa y en las rotaciones nuevas. Su historial se conserva. Revisa las tareas donde participaba.</p>
          <button class="btn btn-peligro" type="button" onClick={async () => { const m = removing; setRemoving(null); await attempt(() => actions.updateMember(m.id, { active: false }), `${m.name} ya no está en la casa`); }}>Quitar</button>
          <button class="btn btn-texto" type="button" onClick={() => setRemoving(null)}>Cancelar</button>
        </Sheet>
      )}
    </main>
  );
}

function AddMember({ h, onClose, onInvite }) {
  const used = new Set(h.active.map((m) => m.color_index));
  const [name, setName] = useState('');
  const [color, setColor] = useState([1, 2, 3, 4, 5].find((i) => !used.has(i)) || 5);
  const [busy, setBusy] = useState(false);
  const create = async (withAccount) => {
    setBusy(true);
    const m = await attempt(() => actions.addMember(name.trim(), color), `${name.trim()} agregado`);
    setBusy(false);
    if (!m) return;
    if (withAccount) onInvite(m); else onClose();
  };
  return (
    <Sheet label="Agregar persona" onClose={onClose}>
      <h2 class="titulo">Agregar persona</h2>
      <div class="field"><label for="nm">Nombre</label><input id="nm" class="input" value={name} onInput={(e) => setName(e.currentTarget.value)} /></div>
      <span class="label">Color</span>
      <div class="row-wrap">
        {[1, 2, 3, 4, 5].map((i) => (
          <button type="button" aria-label={`Color ${i}`} aria-pressed={color === i ? 'true' : 'false'} onClick={() => setColor(i)}
            style={`width:44px;height:44px;border-radius:50%;padding:0;border:3px solid ${color === i ? 'var(--tinta)' : 'var(--superficie)'};background:var(--persona-${i})`} />
        ))}
      </div>
      <button class="btn btn-primario" type="button" disabled={busy || !name.trim()} onClick={() => create(true)}>Agregar e invitar</button>
      <button class="btn btn-secundario" type="button" disabled={busy || !name.trim()} onClick={() => create(false)}>Agregar sin cuenta</button>
      <span class="meta">"Sin cuenta" es para quien no usa la app: aparece en las rotaciones y un admin marca sus tareas.</span>
    </Sheet>
  );
}
