import { useEffect, useState } from 'preact/hooks';
import { loadRange, ruleSummary } from '../lib/house.js';
import { addDays, weekdayOf, dutiesOn, lookupSlot } from '../../supabase/functions/_shared/schedule.js';
import { weekdayName } from '../../supabase/functions/_shared/format.js';
import { Avatar, Icon, toast } from '../components/ui.jsx';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const CORTO = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const day = (iso) => Number(iso.slice(8, 10));
const month = (iso) => MESES[Number(iso.slice(5, 7)) - 1];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const color = (m) => `var(--persona-${m?.color_index || 1})`;

function weekTitle(offset) {
  if (offset === 0) return 'Esta semana';
  if (offset === 1) return 'La semana que viene';
  if (offset === -1) return 'La semana pasada';
  return offset > 0 ? `En ${offset} semanas` : `Hace ${-offset} semanas`;
}

function rangeText(start, end) {
  return month(start) === month(end)
    ? `Del ${day(start)} al ${day(end)} de ${month(end)}`
    : `Del ${day(start)} de ${month(start)} al ${day(end)} de ${month(end)}`;
}

/**
 * Coberturas y completadas para la semana que se ve. `useHouse` trae desde hace 7 días
 * (y todo lo futuro), así que solo hace falta pedirlas para semanas más viejas.
 */
function useWeekData(h, start, end) {
  const loaded = start >= addDays(h.today, -7);
  const [extra, setExtra] = useState(null);
  useEffect(() => {
    if (loaded) return undefined;
    let alive = true;
    setExtra(null);
    loadRange(start, end).then((r) => { if (alive) setExtra(r); }).catch((e) => toast(e.message || 'No se pudo cargar esa semana'));
    return () => { alive = false; };
  }, [loaded, start, end]);
  if (loaded) return { ov: h.ov, done: h.done };
  return extra;
}

export function Week({ h }) {
  const [offset, setOffset] = useState(0);
  const [who, setWho] = useState('todos');
  const [showPast, setShowPast] = useState(false);
  const start = addDays(h.today, (1 - weekdayOf(h.today)) + offset * 7);
  const end = addDays(start, 6);
  const data = useWeekData(h, start, end);
  const name = (id) => h.byId.get(id)?.name || 'Alguien';

  const dates = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(start, i));
  const chores = h.chores.filter((c) => c.active);

  // Una fila por puesto: quién la hace, cómo va y si hubo un cambio.
  const all = [];
  if (data) {
    for (const date of dates) {
      dutiesOn(chores, date, data.ov).forEach((d, i, list) => {
        const first = list.findIndex((x) => x.chore.id === d.chore.id) === i;
        const done = lookupSlot(data.done, d.chore.id, date, d.slot, first);
        const status = done ? 'hecha' : date < h.today ? 'sin' : date === h.today ? 'pendiente' : 'futura';
        const team = list.filter((x) => x.chore.id === d.chore.id).length > 1;
        const o = d.override;
        const note = !o ? (team ? 'en equipo' : '')
          : o.reason === 'cubre' ? `cubre a ${name(o.covered_member)}`
            : o.reason === 'devuelve' ? `devuelve a ${name(o.covered_member)}` : 'cambio manual';
        all.push({ ...d, status, note, team, doneBy: done?.done_by });
      });
    }
  }
  const mine = (d) => who === 'todos' || d.assignee === who;
  const shown = all.filter(mine);

  // Personas: tú primero y luego el orden de la casa; solo quien está activo o tiene algo esta semana.
  const people = [h.me, ...h.members.filter((m) => m.id !== h.me.id)]
    .filter((m) => m.active || all.some((d) => d.assignee === m.id))
    .map((m) => {
      const theirs = all.filter((d) => d.assignee === m.id);
      return { m, total: theirs.length, done: theirs.filter((d) => d.status === 'hecha').length, missed: theirs.filter((d) => d.status === 'sin').length };
    });

  const future = offset > 0;
  const doneCount = shown.filter((d) => d.status === 'hecha').length;
  const missedCount = shown.filter((d) => d.status === 'sin').length;
  const subject = who === 'todos' ? 'La casa tiene' : who === h.me.id ? 'Tienes' : `${name(who)} tiene`;
  let summary = `${subject} ${shown.length} ${shown.length === 1 ? 'tarea' : 'tareas'} ${offset === 0 ? 'esta' : 'esa'} semana`;
  if (!future) summary += ` · ${doneCount} ${doneCount === 1 ? 'hecha' : 'hechas'}${missedCount ? `, ${missedCount} sin hacer` : ''}`;

  // En el celular, los días que ya pasaron de esta semana quedan plegados en una línea.
  const fold = offset === 0 && !showPast;
  const past = shown.filter((d) => d.date < h.today);
  const pastDone = past.filter((d) => d.status === 'hecha').length;
  const pastMissed = past.filter((d) => d.status === 'sin').length;
  const yesterday = addDays(h.today, -1);
  const pastLabel = weekdayOf(h.today) === 2 ? 'Lunes' : `${cap(weekdayName(1))} a ${weekdayName(weekdayOf(yesterday))}`;

  const rows = chores
    .map((chore) => ({ chore, cells: dates.map((date) => all.filter((d) => d.chore.id === chore.id && d.date === date)) }))
    .filter((r) => r.cells.some((c) => c.length > 0));

  const statusText = (d) => (d.status === 'hecha' ? (d.doneBy && d.doneBy !== d.assignee ? `hecha por ${name(d.doneBy)}` : 'hecha')
    : d.status === 'sin' ? 'quedó sin hacer' : d.status === 'pendiente' ? 'pendiente hoy' : 'le toca');

  return (
    <main class="screen with-nav ancha semana">
      <header class="semana-cabeza">
        <div class="grow stack-sm">
          <span class="eyebrow">{rangeText(start, end)}</span>
          <h1 class="display">{weekTitle(offset)}</h1>
        </div>
        <div class="row" style="gap:8px">
          <button class="btn btn-secundario btn-icono" type="button" aria-label="Semana anterior" onClick={() => setOffset(offset - 1)}><Icon name="atras" size={22} /></button>
          <button class="btn btn-secundario solo-ancha" type="button" disabled={offset === 0} onClick={() => setOffset(0)}>Esta semana</button>
          <button class="btn btn-secundario btn-icono" type="button" aria-label="Semana siguiente" onClick={() => setOffset(offset + 1)}><Icon name="adelante" size={22} /></button>
        </div>
      </header>

      {offset !== 0 && <button class="btn semana-volver solo-celular" type="button" onClick={() => setOffset(0)}>Volver a esta semana</button>}

      <div class="semana-chips" role="group" aria-label="Ver tareas de">
        <button type="button" class="chip-persona" aria-pressed={who === 'todos' ? 'true' : 'false'} onClick={() => setWho('todos')}>Toda la casa</button>
        {people.map(({ m }) => (
          <button type="button" class="chip-persona con-avatar" aria-pressed={who === m.id ? 'true' : 'false'} onClick={() => setWho(m.id)}>
            <Avatar member={m} size={30} />{m.id === h.me.id ? 'Yo' : m.name}
          </button>
        ))}
      </div>

      <section class="semana-personas" aria-label="Quién hace qué">
        {people.map(({ m, total, done, missed }) => {
          const on = who === m.id;
          return (
            <button type="button" class={`persona-tarjeta${who !== 'todos' && !on ? ' atenuada' : ''}`} style={`--c:${color(m)}`}
              aria-pressed={on ? 'true' : 'false'} onClick={() => setWho(on ? 'todos' : m.id)}>
              <Avatar member={m} size={44} />
              <span class="grow stack-sm" style="gap:6px">
                <span class="row" style="gap:6px;align-items:baseline">
                  <span style="font-size:16px;line-height:20px;font-weight:800">{m.id === h.me.id ? 'Yo' : m.name}</span>
                  <span class="meta">{future ? `${total} ${total === 1 ? 'tarea' : 'tareas'}` : `${done} de ${total} hechas${missed ? ` · ${missed} sin hacer` : ''}`}</span>
                </span>
                <span class="barra" aria-hidden="true"><span style={`width:${future || !total ? 0 : Math.round((done / total) * 100)}%`} /></span>
              </span>
            </button>
          );
        })}
      </section>

      <div class="semana-resumen">
        <span class="solo-celular semana-icono"><Icon name="calendario" size={22} /></span>
        <span class="grow" style="font-size:14px;line-height:20px;font-weight:600">{data ? summary : 'Cargando…'}</span>
        {who !== 'todos' && <button class="btn semana-volver solo-ancha" type="button" onClick={() => setWho('todos')}>Ver a toda la casa</button>}
      </div>

      {!data && <div class="center" style="min-height:200px"><div class="spinner" aria-label="Cargando" /></div>}

      {data && (
        <div class="semana-lista stack" style="gap:20px">
          {offset === 0 && past.length > 0 && (
            <button type="button" class="semana-pasados" aria-expanded={showPast ? 'true' : 'false'} onClick={() => setShowPast(!showPast)}>
              <span class="grow">{pastLabel}: {pastDone} de {past.length} hechas{pastMissed ? ` · ${pastMissed} sin hacer` : ''}</span>
              <span style="color:var(--primario)">{showPast ? 'Ocultar' : 'Ver'}</span>
            </button>
          )}
          {dates.filter((date) => !(fold && date < h.today)).map((date) => {
            const list = shown.filter((d) => d.date === date);
            const isToday = date === h.today;
            const done = list.filter((d) => d.status === 'hecha').length;
            const title = `${cap(weekdayName(weekdayOf(date)))} ${day(date)}`;
            return (
              <section class={`semana-dia stack${isToday ? ' es-hoy' : ''}`} style="gap:8px" aria-label={title}>
                <div class="semana-dia-cabeza">
                  <h2 class="seccion grow">{isToday ? `Hoy, ${title.toLowerCase()}` : title}</h2>
                  {list.length > 0 && <span class="meta">{date > h.today ? `${list.length} ${list.length === 1 ? 'tarea' : 'tareas'}` : `${done} de ${list.length} hechas`}</span>}
                </div>
                <div class="card list">
                  {list.length === 0 && <p class="muted" style="padding:14px 0;font-size:14px">
                    {who === 'todos' ? 'No hay tareas.' : who === h.me.id ? 'Ese día no te toca nada.' : `Ese día ${name(who)} no tiene nada.`}
                  </p>}
                  {list.map((d) => {
                    const m = h.byId.get(d.assignee);
                    return (
                      <div class="list-row" style="padding:10px 0">
                        <Avatar member={m} size={36} />
                        <div class="grow" style="display:flex;flex-direction:column;gap:1px">
                          <span class="tarea" style="font-size:15px;line-height:21px">{d.chore.name}</span>
                          <span style={`font-size:13px;line-height:18px;font-weight:700;color:${color(m)}`}>
                            {d.assignee === h.me.id ? 'Tú' : name(d.assignee)}
                            {d.note && <span class="meta"> · {d.note}</span>}
                          </span>
                        </div>
                        {d.status === 'hecha' && <span style="color:var(--cascara);display:flex"><Icon name="check" size={24} strokeWidth={2.4} label={statusText(d)} /></span>}
                        {d.status === 'sin' && <span class="chip chip-aviso" style="align-self:center">Sin hacer</span>}
                        {d.status === 'pendiente' && <span class="chip chip-pendiente" style="align-self:center">Pendiente</span>}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {data && (
        <div class="semana-tabla card">
          <table>
            <caption class="sr-only">Tareas de la semana por día y persona</caption>
            <colgroup><col style="width:188px" />{dates.map(() => <col />)}</colgroup>
            <thead>
              <tr>
                <th scope="col" class="eyebrow">Tarea</th>
                {dates.map((date) => (
                  <th scope="col" class={date === h.today ? 'es-hoy' : undefined}>
                    <span class="eyebrow">{date === h.today ? `Hoy · ${CORTO[weekdayOf(date)]}` : CORTO[weekdayOf(date)]}</span>
                    <span class="semana-num">{day(date)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={8} class="muted">No hay tareas esta semana.</td></tr>}
              {rows.map(({ chore, cells }) => (
                <tr>
                  <th scope="row">
                    <span class="tarea" style="font-size:15px;line-height:20px;display:block">{chore.name}</span>
                    <span class="meta" style="font-size:12px;line-height:16px">{ruleSummary(chore, start)}</span>
                  </th>
                  {cells.map((cell, i) => {
                    const missed = cell.some((d) => d.status === 'sin');
                    const note = missed ? 'Quedó sin hacer' : cell.find((d) => d.override)?.note || (cell.length > 1 ? 'En equipo' : '');
                    return (
                      <td class={dates[i] === h.today ? 'es-hoy' : undefined}>
                        <div class="stack" style="gap:4px">
                          {cell.map((d) => {
                            const m = h.byId.get(d.assignee);
                            return (
                              <span class={`pastilla ${d.status}${mine(d) ? '' : ' atenuada'}`} style={`--c:${color(m)}`}
                                title={`${name(d.assignee)}: ${statusText(d)}`}>
                                <Avatar member={m} size={24} />
                                <span class="grow pastilla-nombre">{d.assignee === h.me.id ? 'Yo' : name(d.assignee)}</span>
                                {d.status === 'hecha' && <Icon name="check" size={16} strokeWidth={3} label="hecha" />}
                                {d.status === 'sin' && <span class="sr-only">, sin hacer</span>}
                              </span>
                            );
                          })}
                          {note && <span class={`meta${missed ? ' nota-aviso' : ''}`} style="font-size:12px;line-height:16px;padding-left:4px">{cap(note)}</span>}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && (
        <div class="semana-leyenda meta" aria-hidden="true">
          <span><span class="pastilla muestra" style={`--c:${color(h.me)}`} />Por hacer</span>
          <span><span class="pastilla muestra hecha" style={`--c:${color(h.me)}`} />Hecha</span>
          <span><span class="pastilla muestra sin" />Quedó sin hacer</span>
        </div>
      )}
    </main>
  );
}
