import { describe, it, expect } from 'vitest';
import {
  baseAssignee, baseAssignees, assigneeOn, assigneesOn, indexOverrides, findReturnDate, weekdayOf,
  addDays, nowIn, dutiesOn, nextTurns, seatsOn, lookupSlot
} from '../supabase/functions/_shared/schedule.js';

const S = 'santiago', I = 'isis', V = 'victoria', A = 'aries';

// Lun-Jue fijos, viernes rota semanalmente, fines de semana fuera.
const trastes = {
  id: 'trastes',
  rules: [{
    effective_from: '2026-10-19', start_date: '2026-10-23', mode: 'weekly',
    participants: [S, I, V, A],
    slots: { 1: { fixed: A }, 2: { fixed: I }, 3: { fixed: V }, 4: { fixed: S }, 5: { rotate: true } }
  }]
};

const basura = {
  id: 'basura',
  rules: [{ effective_from: '2026-10-19', start_date: '2026-10-19', mode: 'daily_rotation', participants: [S, I, V, A], days: [1, 2, 3, 4, 5] }]
};

const plantas = {
  id: 'plantas',
  rules: [{ effective_from: '2026-10-20', start_date: '2026-10-20', mode: 'every_n', n: 3, participants: [I, A] }]
};

describe('fechas', () => {
  it('weekday: 19 oct 2026 es lunes', () => {
    expect(weekdayOf('2026-10-19')).toBe(1);
    expect(weekdayOf('2026-10-25')).toBe(7);
  });
  it('addDays cruza meses', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
  });
  it('nowIn usa la zona de la casa', () => {
    // 2026-10-20 03:30 UTC = 2026-10-19 21:30 en Costa Rica
    expect(nowIn('America/Costa_Rica', new Date('2026-10-20T03:30:00Z'))).toEqual({ date: '2026-10-19', time: '21:30' });
  });
});

describe('weekly con viernes rotativo', () => {
  it('días fijos', () => {
    expect(baseAssignee(trastes, '2026-10-19')).toBe(A);
    expect(baseAssignee(trastes, '2026-10-20')).toBe(I);
    expect(baseAssignee(trastes, '2026-10-21')).toBe(V);
    expect(baseAssignee(trastes, '2026-10-22')).toBe(S);
  });
  it('viernes: S, I, V, A y vuelve a S', () => {
    expect(['2026-10-23', '2026-10-30', '2026-11-06', '2026-11-13', '2026-11-20'].map((d) => baseAssignee(trastes, d)))
      .toEqual([S, I, V, A, S]);
  });
  it('fin de semana sin slot', () => {
    expect(baseAssignee(trastes, '2026-10-24')).toBeNull();
    expect(baseAssignee(trastes, '2026-10-25')).toBeNull();
  });
  it('antes de la primera regla no hay tarea', () => {
    expect(baseAssignee(trastes, '2026-10-12')).toBeNull();
  });
  it('tarea pausada no aparece', () => {
    expect(baseAssignee({ ...trastes, active: false }, '2026-10-19')).toBeNull();
  });
});

describe('daily_rotation', () => {
  it('rota por ocurrencia, saltando fines de semana', () => {
    expect(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-26'].map((d) => baseAssignee(basura, d)))
      .toEqual([S, I, V, A, S, I]);
    expect(baseAssignee(basura, '2026-10-24')).toBeNull();
  });
  it('sigue correcta semanas después', () => {
    // ocurrencia 20 (4 semanas x 5 días) → vuelve a S
    expect(baseAssignee(basura, '2026-11-16')).toBe(S);
  });
});

describe('every_n con participantes parciales', () => {
  it('cada 3 días entre Isis y Aries', () => {
    expect(baseAssignee(plantas, '2026-10-20')).toBe(I);
    expect(baseAssignee(plantas, '2026-10-21')).toBeNull();
    expect(baseAssignee(plantas, '2026-10-23')).toBe(A);
    expect(baseAssignee(plantas, '2026-10-26')).toBe(I);
  });
});

describe('reglas versionadas', () => {
  const versionada = {
    ...trastes,
    rules: [
      ...trastes.rules,
      { ...trastes.rules[0], effective_from: '2026-11-02', slots: { ...trastes.rules[0].slots, 1: { fixed: S } } }
    ]
  };
  it('la regla nueva aplica solo desde su fecha', () => {
    expect(baseAssignee(versionada, '2026-10-26')).toBe(A);
    expect(baseAssignee(versionada, '2026-11-02')).toBe(S);
  });
});

describe('coberturas y devoluciones', () => {
  it('Isis cubre el jueves de Santiago → Santiago devuelve el martes de Isis', () => {
    const ov = indexOverrides([]);
    const ret = findReturnDate(trastes, '2026-10-22', I, ov);
    expect(ret).toBe('2026-10-27');
    const ov2 = indexOverrides([
      { chore_id: 'trastes', date: '2026-10-22', assignee: I, reason: 'cubre' },
      { chore_id: 'trastes', date: ret, assignee: S, reason: 'devuelve' }
    ]);
    expect(assigneeOn(trastes, '2026-10-22', ov2)).toBe(I);
    expect(assigneeOn(trastes, '2026-10-27', ov2)).toBe(S);
    expect(assigneeOn(trastes, '2026-11-03', ov2)).toBe(I); // el siguiente martes vuelve a la normalidad
  });
  it('la devolución salta turnos que ya tienen override', () => {
    const ov = indexOverrides([{ chore_id: 'trastes', date: '2026-10-27', assignee: V, reason: 'devuelve' }]);
    expect(findReturnDate(trastes, '2026-10-22', I, ov)).toBe('2026-10-30'); // viernes de Isis
  });
  it('un override nunca crea ocurrencias en días sin tarea', () => {
    const ov = indexOverrides([{ chore_id: 'trastes', date: '2026-10-24', assignee: A }]);
    expect(assigneeOn(trastes, '2026-10-24', ov)).toBeNull();
  });
  it('null si quien cubre no participa', () => {
    expect(findReturnDate(plantas, '2026-10-20', V, indexOverrides())).toBeNull();
  });
});

describe('helpers de UI', () => {
  it('dutiesOn lista lo de un día', () => {
    const d = dutiesOn([trastes, basura, plantas], '2026-10-20', indexOverrides());
    expect(d.map((x) => [x.chore.id, x.assignee])).toEqual([['trastes', I], ['basura', I], ['plantas', I]]);
  });
  it('nextTurns de Aries en trastes', () => {
    expect(nextTurns(trastes, '2026-10-19', A, indexOverrides(), 3)).toEqual(['2026-10-26', '2026-11-02', '2026-11-09']);
  });
});

describe('rotación elegible en weekly', () => {
  // Aries tiene el lunes fijo pero no entra al viernes rotativo.
  const trastes2 = {
    id: 'trastes2',
    rules: [{ ...trastes.rules[0], rotation: [S, I, V] }]
  };
  it('el viernes rota solo entre quienes están en la rotación', () => {
    expect(['2026-10-23', '2026-10-30', '2026-11-06', '2026-11-13'].map((d) => baseAssignee(trastes2, d)))
      .toEqual([S, I, V, S]);
  });
  it('los días fijos no cambian', () => {
    expect(baseAssignee(trastes2, '2026-10-19')).toBe(A);
  });
  it('sin rotation usa a todos los participantes (reglas viejas)', () => {
    expect(baseAssignee(trastes, '2026-11-13')).toBe(A);
  });
});

describe('varias personas en una misma tarea', () => {
  const limpieza = {
    id: 'limpieza',
    rules: [{
      effective_from: '2026-10-19', start_date: '2026-10-24', mode: 'weekly',
      participants: [S, I, V, A], rotation: [S, I, V],
      slots: { 6: { people: [A], rotate: true }, 7: { people: [S, I, V, A] } }
    }]
  };
  it('sábado: Aries fija más una persona que rota', () => {
    expect(baseAssignees(limpieza, '2026-10-24')).toEqual([A, S]);
    expect(baseAssignees(limpieza, '2026-10-31')).toEqual([A, I]);
  });
  it('domingo: toda la casa', () => {
    expect(baseAssignees(limpieza, '2026-10-25')).toEqual([S, I, V, A]);
  });
  it('dutiesOn da un elemento por persona', () => {
    expect(dutiesOn([limpieza], '2026-10-24', indexOverrides()).map((d) => [d.slot, d.assignee])).toEqual([[A, A], [S, S]]);
  });
  it('personas por turno en rotativa diaria', () => {
    const basura2 = { id: 'b2', rules: [{ ...basura.rules[0], per_turn: 2 }] };
    expect(['2026-10-19', '2026-10-20', '2026-10-21'].map((d) => baseAssignees(basura2, d)))
      .toEqual([[S, I], [V, A], [S, I]]);
  });
  it('si hay más personas por turno que en la rotación, entran todas una vez', () => {
    const p3 = { id: 'p3', rules: [{ ...plantas.rules[0], per_turn: 5 }] };
    expect(baseAssignees(p3, '2026-10-20')).toEqual([I, A]);
  });
  it('una cobertura cambia solo el puesto de quien no puede', () => {
    const ov = indexOverrides([{ chore_id: 'limpieza', date: '2026-10-25', slot_of: I, assignee: A, covered_member: I, reason: 'cubre' }]);
    expect(assigneesOn(limpieza, '2026-10-25', ov)).toEqual([S, A, V, A]);
    expect(seatsOn(limpieza, '2026-10-25', ov)[1].override.reason).toBe('cubre');
  });
  it('override viejo sin puesto vale solo para el primero', () => {
    const ov = indexOverrides([{ chore_id: 'limpieza', date: '2026-10-25', assignee: A, reason: 'cubre' }]);
    expect(assigneesOn(limpieza, '2026-10-25', ov)).toEqual([A, I, V, A]);
  });
  it('la devolución busca el siguiente turno de quien cubre, aunque comparta el día', () => {
    // Isis cubre a Victoria el sábado 24 (no es suyo): Victoria paga en el próximo turno de Isis
    expect(findReturnDate(limpieza, '2026-10-24', I, indexOverrides())).toBe('2026-10-25');
    const ov = indexOverrides([{ chore_id: 'limpieza', date: '2026-10-25', slot_of: I, assignee: V, reason: 'devuelve' }]);
    expect(findReturnDate(limpieza, '2026-10-24', I, ov)).toBe('2026-10-31');
  });
  it('lookupSlot encuentra completadas por puesto', () => {
    const done = indexOverrides([{ chore_id: 'limpieza', date: '2026-10-25', slot_of: V }]);
    expect(lookupSlot(done, 'limpieza', '2026-10-25', V, false)).not.toBeNull();
    expect(lookupSlot(done, 'limpieza', '2026-10-25', S, true)).toBeNull();
  });
  it('nextTurns cuenta días compartidos', () => {
    expect(nextTurns(limpieza, '2026-10-23', A, indexOverrides(), 2)).toEqual(['2026-10-24', '2026-10-25']);
  });
});
