// Lógica de rotación compartida entre la PWA y la Edge Function.
// Fechas siempre como 'YYYY-MM-DD' (día civil en la zona de la casa); internamente
// se convierten a número de día UTC para evitar problemas de zona horaria.
//
// Forma de una tarea (tabla chores):
// {
//   id, name, active, default_time: '08:00',
//   rules: [ // versionadas: aplica la de effective_from más reciente <= fecha
//     {
//       effective_from: '2026-10-19',
//       start_date: '2026-10-23',          // ancla de la rotación
//       mode: 'weekly' | 'every_n' | 'daily_rotation',
//       participants: [memberId, ...],     // quienes participan (en every_n y daily_rotation, orden de rotación)
//       rotation: [memberId, ...],         // weekly: quienes rotan y en qué orden (opcional, default participants)
//       per_turn: 1,                       // cuántas personas por turno rotativo (opcional, default 1)
//       slots: { 1: {people: [id, ...], rotate: bool}, ..., 7: ... }, // weekly (1=lun ... 7=dom)
//                                          // forma vieja, aún válida: {fixed: id} | {rotate: true}
//       n: 3,                              // every_n
//       days: [1,2,3,4,5]                  // daily_rotation (opcional, default todos)
//     }
//   ]
// }
//
// Una ocurrencia puede tener varias personas; cada una ocupa un "puesto" (slot) que
// lleva el id de quien lo tiene por regla. Coberturas y completadas van por puesto.

export const DEFAULT_TZ = 'America/Costa_Rica';
const DAY_MS = 86400000;

export function toDayNum(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function fromDayNum(n) {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(iso, k) {
  return fromDayNum(toDayNum(iso) + k);
}

/** 1 = lunes ... 7 = domingo */
export function weekdayOf(isoOrNum) {
  const n = typeof isoOrNum === 'number' ? isoOrNum : toDayNum(isoOrNum);
  const w = new Date(n * DAY_MS).getUTCDay();
  return w === 0 ? 7 : w;
}

/** Fecha y hora "de pared" en la zona de la casa. */
export function nowIn(tz = DEFAULT_TZ, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(now).map((p) => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export function todayIn(tz = DEFAULT_TZ, now = new Date()) {
  return nowIn(tz, now).date;
}

const mod = (a, n) => ((a % n) + n) % n;

export function ruleFor(chore, date) {
  if (!chore || !Array.isArray(chore.rules)) return null;
  let best = null;
  for (const r of chore.rules) {
    if (r.effective_from <= date && (!best || r.effective_from > best.effective_from)) best = r;
  }
  return best;
}

/** Cuántos días de `days` hay en [startN, endN). */
function countWeekdays(startN, endN, days) {
  const total = endN - startN;
  if (total <= 0) return 0;
  const full = Math.floor(total / 7);
  let count = full * days.length;
  for (let i = 0; i < total % 7; i++) {
    if (days.includes(weekdayOf(startN + full * 7 + i))) count++;
  }
  return count;
}

/** {people, rotate} de un día de una regla semanal, aceptando la forma vieja. */
export function slotOf(rule, weekday) {
  const s = rule && rule.slots && rule.slots[weekday];
  if (!s) return { people: [], rotate: false };
  const people = Array.isArray(s.people) ? s.people : s.fixed ? [s.fixed] : [];
  return { people, rotate: Boolean(s.rotate) };
}

/** Quienes rotan en una regla (en weekly puede ser un subconjunto de participants). */
export function rotationOf(rule) {
  if (!rule) return [];
  if (rule.mode === 'weekly' && Array.isArray(rule.rotation)) return rule.rotation;
  return rule.participants || [];
}

/** Todas las personas que aparecen en una regla: participantes, rotación y días fijos. */
export function peopleIn(rule) {
  if (!rule) return [];
  const set = new Set([...(rule.participants || []), ...rotationOf(rule)]);
  if (rule.mode === 'weekly') for (let d = 1; d <= 7; d++) for (const id of slotOf(rule, d).people) set.add(id);
  return [...set];
}

/** k personas seguidas de la rotación a partir del turno número `turn`. */
function pickTurn(list, turn, perTurn) {
  if (!list.length) return [];
  const k = Math.min(Math.max(1, perTurn || 1), list.length);
  const out = [];
  for (let j = 0; j < k; j++) out.push(list[mod(turn * k + j, list.length)]);
  return out;
}

const uniq = (ids) => [...new Set(ids)];

/** Responsables según las reglas, sin contar coberturas. [] = no hay tarea ese día. */
export function baseAssignees(chore, date) {
  if (!chore || chore.active === false) return [];
  const r = ruleFor(chore, date);
  if (!r) return [];
  const rot = rotationOf(r);
  const d = toDayNum(date);
  const s = toDayNum(r.start_date || r.effective_from);

  switch (r.mode) {
    case 'weekly': {
      const slot = slotOf(r, weekdayOf(d));
      const rotating = slot.rotate ? pickTurn(rot, Math.floor((d - s) / 7), r.per_turn) : [];
      return uniq([...slot.people, ...rotating]);
    }
    case 'every_n': {
      const n = Math.max(1, r.n || 1);
      const diff = d - s;
      if (diff < 0 || diff % n !== 0) return [];
      return pickTurn(rot, diff / n, r.per_turn);
    }
    case 'daily_rotation': {
      const days = r.days && r.days.length ? r.days : [1, 2, 3, 4, 5, 6, 7];
      if (d < s || !days.includes(weekdayOf(d))) return [];
      return pickTurn(rot, countWeekdays(s, d, days), r.per_turn);
    }
    default:
      return [];
  }
}

/** Primer responsable por regla (null = no hay tarea ese día). */
export function baseAssignee(chore, date) {
  return baseAssignees(chore, date)[0] ?? null;
}

const key = (choreId, date, slot) => `${choreId}|${date}|${slot || ''}`;

/**
 * Índice por (tarea, fecha, puesto) para overrides y completadas.
 * Filas viejas sin slot_of valen para el primer puesto del día.
 */
export function indexBySlot(list = []) {
  const m = new Map();
  for (const o of list) m.set(key(o.chore_id, o.date, o.slot_of), o);
  return m;
}
export const indexOverrides = indexBySlot;

export function lookupSlot(idx, choreId, date, slot, first) {
  if (!idx) return null;
  return idx.get(key(choreId, date, slot)) || (first ? idx.get(key(choreId, date, null)) || null : null);
}

export function overrideFor(chore, date, ovIdx, slot) {
  const base = baseAssignees(chore, date);
  const s = slot === undefined ? base[0] : slot;
  return lookupSlot(ovIdx, chore.id, date, s, s === base[0]);
}

/** Puestos de una ocurrencia: [{slot, assignee, override}]. La cobertura le gana a la regla. */
export function seatsOn(chore, date, ovIdx) {
  if (!chore || chore.active === false) return [];
  // una cobertura nunca crea ocurrencias nuevas
  return baseAssignees(chore, date).map((slot, i) => {
    const o = lookupSlot(ovIdx, chore.id, date, slot, i === 0);
    return { slot, assignee: o ? o.assignee : slot, override: o };
  });
}

/** Responsables efectivos de una ocurrencia (puede repetir a alguien que cubre dos puestos). */
export function assigneesOn(chore, date, ovIdx) {
  return seatsOn(chore, date, ovIdx).map((x) => x.assignee);
}

/** Primer responsable efectivo (compatibilidad). */
export function assigneeOn(chore, date, ovIdx) {
  return assigneesOn(chore, date, ovIdx)[0] ?? null;
}

/**
 * Si `coverer` cubre la ocurrencia de `fromDate`, la persona cubierta paga en el
 * siguiente turno base de `coverer` en esa misma tarea cuyo puesto no tenga ya un override.
 */
export function findReturnDate(chore, fromDate, coverer, ovIdx, horizonDays = 180) {
  for (let i = 1; i <= horizonDays; i++) {
    const dt = addDays(fromDate, i);
    const base = baseAssignees(chore, dt);
    const at = base.indexOf(coverer);
    if (at < 0) continue;
    if (lookupSlot(ovIdx, chore.id, dt, coverer, at === 0)) continue;
    return dt;
  }
  return null;
}

/** Todas las tareas con responsable en una fecha, un elemento por puesto. */
export function dutiesOn(chores, date, ovIdx) {
  const out = [];
  for (const chore of chores) {
    for (const seat of seatsOn(chore, date, ovIdx)) out.push({ chore, date, ...seat });
  }
  return out;
}

/** Próximas ocurrencias de una persona en una tarea (para la UI). */
export function nextTurns(chore, fromDate, memberId, ovIdx, count = 1, horizonDays = 120) {
  const out = [];
  for (let i = 1; i <= horizonDays && out.length < count; i++) {
    const dt = addDays(fromDate, i);
    if (assigneesOn(chore, dt, ovIdx).includes(memberId)) out.push(dt);
  }
  return out;
}
