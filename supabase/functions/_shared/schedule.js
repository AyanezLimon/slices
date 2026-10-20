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
//       participants: [memberId, ...],     // orden de rotación
//       slots: { 1: {fixed: id} | {rotate: true}, ..., 7: ... }, // weekly (1=lun ... 7=dom)
//       n: 3,                              // every_n
//       days: [1,2,3,4,5]                  // daily_rotation (opcional, default todos)
//     }
//   ]
// }

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

/** Responsable según las reglas, sin contar coberturas. null = no hay tarea ese día. */
export function baseAssignee(chore, date) {
  if (!chore || chore.active === false) return null;
  const r = ruleFor(chore, date);
  if (!r) return null;
  const parts = r.participants || [];
  const d = toDayNum(date);
  const s = toDayNum(r.start_date || r.effective_from);

  switch (r.mode) {
    case 'weekly': {
      const slot = r.slots && r.slots[weekdayOf(d)];
      if (!slot) return null;
      if (slot.fixed) return slot.fixed;
      if (slot.rotate) {
        if (!parts.length) return null;
        return parts[mod(Math.floor((d - s) / 7), parts.length)];
      }
      return null;
    }
    case 'every_n': {
      const n = Math.max(1, r.n || 1);
      const diff = d - s;
      if (diff < 0 || diff % n !== 0 || !parts.length) return null;
      return parts[(diff / n) % parts.length];
    }
    case 'daily_rotation': {
      const days = r.days && r.days.length ? r.days : [1, 2, 3, 4, 5, 6, 7];
      if (d < s || !days.includes(weekdayOf(d)) || !parts.length) return null;
      return parts[countWeekdays(s, d, days) % parts.length];
    }
    default:
      return null;
  }
}

const key = (choreId, date) => `${choreId}|${date}`;

/** overrides: [{chore_id, date, assignee, reason, covered_member}] */
export function indexOverrides(list = []) {
  const m = new Map();
  for (const o of list) m.set(key(o.chore_id, o.date), o);
  return m;
}

export function overrideFor(chore, date, ovIdx) {
  return ovIdx ? ovIdx.get(key(chore.id, date)) || null : null;
}

/** Responsable efectivo: la cobertura/devolución le gana a la regla. */
export function assigneeOn(chore, date, ovIdx) {
  if (!chore || chore.active === false) return null;
  const base = baseAssignee(chore, date);
  if (base === null) return null; // una cobertura nunca crea ocurrencias nuevas
  const o = overrideFor(chore, date, ovIdx);
  return o ? o.assignee : base;
}

/**
 * Si `coverer` cubre la ocurrencia de `fromDate`, la persona cubierta paga en el
 * siguiente turno base de `coverer` en esa misma tarea que no tenga ya un override.
 */
export function findReturnDate(chore, fromDate, coverer, ovIdx, horizonDays = 180) {
  for (let i = 1; i <= horizonDays; i++) {
    const dt = addDays(fromDate, i);
    if (ovIdx && ovIdx.has(key(chore.id, dt))) continue;
    if (baseAssignee(chore, dt) === coverer) return dt;
  }
  return null;
}

/** Todas las tareas con responsable en una fecha. */
export function dutiesOn(chores, date, ovIdx) {
  const out = [];
  for (const chore of chores) {
    const who = assigneeOn(chore, date, ovIdx);
    if (who) out.push({ chore, date, assignee: who, override: overrideFor(chore, date, ovIdx) });
  }
  return out;
}

/** Próximas ocurrencias de una persona en una tarea (para la UI). */
export function nextTurns(chore, fromDate, memberId, ovIdx, count = 1, horizonDays = 120) {
  const out = [];
  for (let i = 1; i <= horizonDays && out.length < count; i++) {
    const dt = addDays(fromDate, i);
    if (assigneeOn(chore, dt, ovIdx) === memberId) out.push(dt);
  }
  return out;
}
