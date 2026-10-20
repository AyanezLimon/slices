// Textos de fecha en español, compartidos por la PWA y la Edge Function.
import { toDayNum, weekdayOf } from './schedule.js';

const DIAS = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function dayName(iso) {
  return DIAS[weekdayOf(iso)];
}

/** "hoy", "mañana", "el martes 27", "el 3 de noviembre" (más de 2 semanas). */
export function relDate(iso, today) {
  const diff = toDayNum(iso) - toDayNum(today);
  if (diff === 0) return 'hoy';
  if (diff === 1) return 'mañana';
  if (diff === -1) return 'ayer';
  const d = Number(iso.slice(8, 10));
  if (diff > 0 && diff < 14) return `el ${DIAS[weekdayOf(iso)]} ${d}`;
  return `el ${d} de ${MESES[Number(iso.slice(5, 7)) - 1]}`;
}

/** "Lunes 19 de octubre" */
export function longDate(iso) {
  const s = `${DIAS[weekdayOf(iso)]} ${Number(iso.slice(8, 10))} de ${MESES[Number(iso.slice(5, 7)) - 1]}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function listJoin(names) {
  if (names.length <= 1) return names.join('');
  return names.slice(0, -1).join(', ') + ' y ' + names[names.length - 1];
}
