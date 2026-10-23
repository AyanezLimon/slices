import { useState } from 'preact/hooks';
import { todayView, ruleMeta, participantsOf, returnFor, seatOf, actions, ckey } from '../lib/house.js';
import { relDate, longDate, listJoin } from '../../supabase/functions/_shared/format.js';
import { Avatar, Icon, Sheet, Gauge, InstallCard, attempt } from '../components/ui.jsx';

const hhmm = (ts) => new Date(ts).toLocaleTimeString('es-CR', { hour: 'numeric', minute: '2-digit' });

export function Today({ h }) {
  const v = todayView(h);
  const [coverFor, setCoverFor] = useState(null); // duty para "No puedo"
  const [confirm, setConfirm] = useState(null);   // {duty, returnDate} para "Yo la hice"
  const name = (id) => h.byId.get(id)?.name || 'Alguien';

  const doneCount = v.duties.filter((d) => d.completion).length;
  const mineDone = v.mine.filter((d) => d.completion).length;
  const minePending = v.mine.length > mineDone;
  const houseText = v.duties.length === 0 ? 'Hoy no hay tareas' : doneCount === v.duties.length ? 'Casa al día' : `${doneCount} de ${v.duties.length} en la casa`;

  const toggle = (d) => attempt(() => (d.completion ? actions.undoDone(d.completion) : actions.markDone(h, d)));

  const chipFor = (d) => {
    const o = d.override;
    if (!o) return null;
    if (o.reason === 'devuelve') return d.assignee === h.me.id ? `Devolución: ${name(o.covered_member)} te cubrió` : `Devolución a ${name(o.covered_member)}`;
    if (o.reason === 'cubre') return d.assignee === h.me.id ? `Cubres a ${name(o.covered_member)}` : `Cubre a ${name(o.covered_member)}`;
    return 'Cambio manual';
  };

  return (
    <main class="screen with-nav ancha hoy">
      <header class="stack-sm">
        <span class="eyebrow">{longDate(h.today)}</span>
        <h1 class="display">Hola, {h.me.name}</h1>
      </header>

      {/* En el celular las dos columnas se deshacen (display: contents) y el orden lo da `order`. */}
      <div class="hoy-principal">
      <InstallCard />
      {v.forMe.length > 0 && (
        <section class="stack">
          <h2 class="seccion">Te piden ayuda</h2>
          {v.forMe.map((r) => {
            const chore = h.chores.find((c) => c.id === r.chore_id);
            if (!chore) return null;
            const back = returnFor(h, chore, r.date, h.me.id);
            return (
              <div class="card tarjeta-fila">
                <div class="row">
                  <Avatar member={h.byId.get(r.requester)} size={40} />
                  <div class="grow stack-sm">
                    <span class="tarea">{name(r.requester)} no puede con {chore.name}</span>
                    <span class="meta">{relDate(r.date, h.today)}{back ? ` · te devuelve ${relDate(back, h.today)}` : ''}</span>
                  </div>
                </div>
                <button class="btn btn-primario" type="button"
                  onClick={() => attempt(() => actions.coverTask({ choreId: chore.id, date: r.date, slot: seatOf(h, chore, r.date, r.requester), covered: r.requester, returnDate: back, requestId: r.id }), `Cubres a ${name(r.requester)}`)}>
                  La cubro yo
                </button>
              </div>
            );
          })}
        </section>
      )}

      <section class="stack">
        <h2 class="seccion">Lo que me toca</h2>
        {v.mine.length === 0 && <div class="card"><p class="muted">Hoy no te toca nada. Disfruta.</p></div>}
        {v.mine.map((d) => {
          const sent = v.mySent.get(ckey(d.chore.id, h.today));
          const chip = chipFor(d);
          return (
            <div class="card tarjeta-fila">
              <div class="row" style="align-items:flex-start">
                <button type="button" class={`check${d.completion ? ' on' : ''}`} onClick={() => toggle(d)}
                  aria-label={d.completion ? `Desmarcar ${d.chore.name}` : `Marcar ${d.chore.name} como hecha`}>
                  {d.completion && <Icon name="check" size={22} strokeWidth={3} />}
                </button>
                <div class="grow stack-sm" style="padding-top:2px">
                  <span class={`tarea${d.completion ? ' strike' : ''}`}>{d.chore.name}</span>
                  <span class="meta">{d.completion ? `Hecha a las ${hhmm(d.completion.done_at)}` : (d.chore.description || ruleMeta(d.chore, h.today))}</span>
                  {d.team.some((id) => id !== h.me.id) && <span class="meta">Con {listJoin([...new Set(d.team.filter((id) => id !== h.me.id))].map(name))}</span>}
                  {chip && !d.completion && <span class="chip chip-aviso" style="margin-top:4px">{chip}</span>}
                  {sent && <span class="chip chip-neutro" style="margin-top:4px">Pedido enviado{sent.target ? ` a ${name(sent.target)}` : ' a todos'}</span>}
                </div>
              </div>
              {!d.completion && (
                <div class="btn-row">
                  <button class="btn btn-primario" type="button" onClick={() => toggle(d)}>Hecho</button>
                  {sent
                    ? <button class="btn btn-secundario" type="button" onClick={() => attempt(() => actions.cancelRequest(sent.id), 'Pedido cancelado')}>Cancelar pedido</button>
                    : <button class="btn btn-secundario" type="button" onClick={() => setCoverFor(d)}>No puedo</button>}
                </div>
              )}
            </div>
          );
        })}
      </section>

      </div>

      <div class="hoy-lado">
        <div class="card hoy-medidor">
          <Gauge total={Math.max(1, v.duties.length)} doneCount={v.duties.length ? doneCount : 1} mineFirst={minePending}
            label={`${doneCount} de ${v.duties.length} tareas de la casa hechas`} />
          <div class="stack-sm">
            <span style="font-size:18px;font-weight:800">{houseText}</span>
            {v.mine.length > 0 && <span class="meta">{mineDone} de {v.mine.length} tuyas hechas</span>}
          </div>
        </div>

      {v.others.length > 0 && (
        <section class="stack hoy-resto">
          <h2 class="seccion">Resto de la casa</h2>
          <div class="card list">
            {v.others.map((d) => {
              const who = h.byId.get(d.assignee);
              const noAccount = who && !who.user_id;
              const chip = chipFor(d);
              return (
                <div class="list-row">
                  <Avatar member={who} size={36} />
                  <div class="grow stack-sm">
                    <span class="tarea" style="font-size:15px">{d.chore.name}</span>
                    <span class="meta">
                      {name(d.assignee)}{d.team.length > 0 ? ' (en equipo)' : ''} · {d.completion ? `hecha${d.completion.done_by !== d.assignee ? ` por ${name(d.completion.done_by)}` : ''} a las ${hhmm(d.completion.done_at)}` : 'pendiente'}
                    </span>
                    {chip && <span class="chip chip-aviso">{chip}</span>}
                  </div>
                  {d.completion
                    ? <span style="color:var(--cascara)"><Icon name="check" size={24} label="Hecha" /></span>
                    : noAccount && h.isAdmin
                      ? <button class="btn btn-secundario" style="padding:0 12px" type="button" onClick={() => attempt(() => actions.markDone(h, d))}>Marcar</button>
                      : <button class="btn btn-secundario" style="padding:0 12px" type="button" onClick={() => setConfirm({ duty: d, returnDate: returnFor(h, d.chore, h.today, h.me.id) })}>Yo la hice</button>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      </div>

      {coverFor && <CoverSheet h={h} duty={coverFor} onClose={() => setCoverFor(null)} />}

      {confirm && (
        <Sheet label="Confirmar" onClose={() => setConfirm(null)}>
          <div class="stack-sm">
            <h2 class="titulo">{confirm.duty.chore.name}</h2>
            <p class="muted">
              La marcas como hecha por {name(confirm.duty.assignee)}.
              {confirm.returnDate ? ` A cambio, ${name(confirm.duty.assignee)} hace tu turno ${relDate(confirm.returnDate, h.today)}.` : ' No tienes turnos próximos en esta tarea, así que no hay devolución.'}
            </p>
          </div>
          <div class="hoja-acciones">
          <button class="btn btn-primario" type="button" onClick={async () => {
            const d = confirm.duty;
            setConfirm(null);
            await attempt(() => actions.coverTask({ choreId: d.chore.id, date: h.today, slot: d.slot, covered: d.assignee, returnDate: confirm.returnDate, markDone: true }), 'Listo, quedó registrado');
          }}>Sí, la hice yo</button>
          <button class="btn btn-texto" type="button" onClick={() => setConfirm(null)}>Cancelar</button>
          </div>
        </Sheet>
      )}
    </main>
  );
}

function CoverSheet({ h, duty, onClose }) {
  const people = participantsOf(duty.chore, h.today)
    .filter((id) => id !== h.me.id && h.byId.get(id)?.active)
    .map((id) => ({ id, m: h.byId.get(id), next: returnFor(h, duty.chore, h.today, id) }));
  const [picked, setPicked] = useState(people[0]?.id || null);
  const sel = people.find((p) => p.id === picked);
  const send = (target) => attempt(() => actions.requestCover(duty.chore.id, h.today, target), target ? `Pedido enviado a ${h.byId.get(target)?.name}` : 'Pedido enviado a todos').then(onClose);

  return (
    <Sheet label="Pedir que te cubran" onClose={onClose}>
      <div class="stack-sm">
        <span class="eyebrow" style="color:var(--aviso)">No puedo hoy</span>
        <h2 class="titulo">{duty.chore.name}</h2>
        <p class="muted">Elige quién te cubre. A cambio, tú haces su próximo turno de esta tarea.</p>
      </div>
      {people.length === 0 && <p class="muted">Nadie más participa en esta tarea. Pide a un administrador que agregue participantes.</p>}
      <div class="stack" style="gap:8px">
        {people.map((p) => (
          <button type="button" class="pick" aria-pressed={picked === p.id ? 'true' : 'false'} onClick={() => setPicked(p.id)}>
            <Avatar member={p.m} size={40} />
            <span class="grow stack-sm">
              <span class="tarea">{p.m.name}</span>
              <span class="meta">{p.next ? `Su próximo turno: ${relDate(p.next, h.today)}` : 'Sin turnos próximos'}</span>
            </span>
            {picked === p.id && <span style="color:var(--primario)"><Icon name="check" /></span>}
          </button>
        ))}
      </div>
      {sel && (
        <div class="tenue row" style="align-items:flex-start">
          <Icon name="rotar" size={20} />
          <p style="font-size:14px">{sel.next ? `Si ${sel.m.name} te cubre hoy, tú haces su turno ${relDate(sel.next, h.today)}.` : `${sel.m.name} no tiene turnos próximos; no habría devolución.`}</p>
        </div>
      )}
      <div class="stack hoja-acciones" style="gap:8px">
        {sel && <button class="btn btn-primario" type="button" onClick={() => send(sel.id)}>Enviar pedido a {sel.m.name}</button>}
        {people.length > 1 && <button class="btn btn-secundario" type="button" onClick={() => send(null)}>Pedir a cualquiera</button>}
        <button class="btn btn-texto" type="button" onClick={onClose}>Cancelar</button>
      </div>
    </Sheet>
  );
}
