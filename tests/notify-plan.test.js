import { describe, it, expect } from 'vitest';
import {
  planReminders, reminderMessages, planCoverRequests, planCovered, fechaHumana, listaEs
} from '../supabase/functions/notify/plan.js';

const S = 'santiago', I = 'isis', V = 'victoria', A = 'aries';
const membersById = new Map([[S, { name: 'Santiago' }], [I, { name: 'Isis' }], [V, { name: 'Victoria' }], [A, { name: 'Aries' }]]);
const everyone = new Set([S, I, V, A]);

// 20 oct 2026 es martes: trastes le toca a Isis.
const trastes = {
  id: 'trastes', name: 'Lavar trastes', default_time: '08:00:00',
  rules: [{
    effective_from: '2026-10-19', start_date: '2026-10-23', mode: 'weekly',
    participants: [S, I, V, A],
    slots: { 1: { fixed: A }, 2: { fixed: I }, 3: { fixed: V }, 4: { fixed: S }, 5: { rotate: true } }
  }]
};
const basura = {
  id: 'basura', name: 'Sacar la basura', default_time: '07:30',
  rules: [{ effective_from: '2026-10-19', start_date: '2026-10-19', mode: 'weekly', participants: [I], slots: { 2: { fixed: I } } }]
};
const chores = [trastes, basura];
const today = '2026-10-20';

const base = { today, chores, overrides: [], completions: [], prefsByMember: new Map(), eligible: everyone };

describe('textos', () => {
  it('fechaHumana', () => {
    expect(fechaHumana('2026-10-20', today)).toBe('hoy');
    expect(fechaHumana('2026-10-21', today)).toBe('mañana');
    expect(fechaHumana('2026-10-27', today)).toBe('el martes 27');
  });
  it('listaEs', () => {
    expect(listaEs(['a'])).toBe('a');
    expect(listaEs(['a', 'b', 'c'])).toBe('a, b y c');
  });
});

describe('recordatorios', () => {
  it('antes de la hora no hay nada', () => {
    expect(planReminders({ ...base, now: '07:00' })).toEqual([]);
  });

  it('agrupa las tareas de una persona en un solo aviso', () => {
    const items = planReminders({ ...base, now: '08:00' });
    expect(items.map((i) => i.key).sort()).toEqual(['rem|isis|basura|2026-10-20', 'rem|isis|trastes|2026-10-20']);
    const [msg] = reminderMessages(items, membersById, today);
    expect(msg).toMatchObject({ memberId: I, title: 'Hoy te toca', body: 'Lavar trastes y Sacar la basura', tag: 'rem-20261020' });
    expect(msg.keys).toHaveLength(2);
  });

  it('respeta la hora personal y la ventana de 6 h', () => {
    const prefsByMember = new Map([[I, { chores: { trastes: { time: '18:00' } } }]]);
    expect(planReminders({ ...base, prefsByMember, now: '13:00' }).map((i) => i.chore.id)).toEqual(['basura']);
    expect(planReminders({ ...base, prefsByMember, now: '18:00' }).map((i) => i.chore.id)).toEqual(['trastes']);
    expect(planReminders({ ...base, now: '14:01' })).toEqual([]); // 08:00 + 6 h ya pasó
  });

  it('no avisa si está apagado, sin dispositivo o ya hecha', () => {
    const off = new Map([[I, { chores: { trastes: { on: false }, basura: { on: false } } }]]);
    expect(planReminders({ ...base, prefsByMember: off, now: '09:00' })).toEqual([]);
    expect(planReminders({ ...base, eligible: new Set([S]), now: '09:00' })).toEqual([]);
    const completions = [{ chore_id: 'trastes', date: today }];
    expect(planReminders({ ...base, completions, now: '09:00' }).map((i) => i.chore.id)).toEqual(['basura']);
  });

  it('una devolución avisa aunque la tarea esté apagada, si devolver está activo', () => {
    const overrides = [{ chore_id: 'trastes', date: today, assignee: A, covered_member: I, reason: 'devuelve' }];
    const prefsByMember = new Map([[A, { chores: { trastes: { on: false } } }]]);
    const items = planReminders({ ...base, overrides, prefsByMember, now: '08:30' }).filter((i) => i.memberId === A);
    expect(items).toHaveLength(1);
    const [msg] = reminderMessages(items, membersById, today);
    expect(msg.body).toBe('Lavar trastes (le devuelves el turno a Isis)');

    const sinDevolver = new Map([[A, { chores: { trastes: { on: false } }, cover: { devolver: false } }]]);
    expect(planReminders({ ...base, overrides, prefsByMember: sinDevolver, now: '08:30' }).filter((i) => i.memberId === A)).toEqual([]);
  });

  it('insistir a las 20:00 solo si sigue pendiente', () => {
    const prefsByMember = new Map([[I, { chores: { trastes: { insist: true } } }]]);
    const kinds = (now, completions = []) =>
      planReminders({ ...base, prefsByMember, completions, now }).filter((i) => i.kind === 'night').map((i) => i.key);
    expect(kinds('19:59')).toEqual([]);
    expect(kinds('20:00')).toEqual(['night|isis|trastes|2026-10-20']);
    expect(kinds('20:30', [{ chore_id: 'trastes', date: today }])).toEqual([]);
  });
});

describe('pedidos de cobertura', () => {
  const ctx = { today, chores, membersById, eligible: everyone };

  it('pedido directo va al destinatario si tiene mePiden', () => {
    const requests = [{ id: 'r1234567xx', chore_id: 'trastes', date: today, requester: I, target: A }];
    const { messages, markIds } = planCoverRequests({ ...ctx, requests, prefsByMember: new Map() });
    expect(markIds).toEqual(['r1234567xx']);
    expect(messages).toEqual([{
      memberId: A, keys: ['req|r1234567xx|aries'], kind: 'req', title: '¿Puedes cubrir?',
      body: 'Isis no puede con Lavar trastes hoy. ¿La cubres?', tag: 'req-r1234567'
    }]);
    const off = new Map([[A, { cover: { mePiden: false } }]]);
    expect(planCoverRequests({ ...ctx, requests, prefsByMember: off }).messages).toEqual([]);
  });

  it('pedido abierto va solo a participantes con "general"', () => {
    const requests = [{ id: 'r2', chore_id: 'trastes', date: '2026-10-21', requester: V, target: null }];
    const prefsByMember = new Map([[S, { cover: { general: true } }], [V, { cover: { general: true } }]]);
    const { messages } = planCoverRequests({ ...ctx, requests, prefsByMember });
    expect(messages.map((m) => m.memberId)).toEqual([S]);
    expect(messages[0].body).toBe('Victoria no puede con Lavar trastes mañana. ¿Quién cubre?');
  });

  it('pedidos de días pasados se marcan sin avisar', () => {
    const requests = [{ id: 'r3', chore_id: 'trastes', date: '2026-10-19', requester: A, target: I }];
    const res = planCoverRequests({ ...ctx, requests, prefsByMember: new Map() });
    expect(res).toEqual({ messages: [], markIds: ['r3'] });
  });
});

describe('te cubrieron', () => {
  const nowMs = Date.parse('2026-10-20T15:00:00Z');
  const ctx = { today, nowMs, chores, membersById, eligible: everyone, prefsByMember: new Map() };
  const cover = { id: 'o1234567zz', chore_id: 'trastes', date: today, assignee: A, covered_member: I, pair_id: 'p1', created_at: '2026-10-20T14:50:00Z' };

  it('avisa a la persona cubierta con su devolución', () => {
    const { messages, markIds } = planCovered({ ...ctx, covers: [cover], returns: new Map([['p1', '2026-10-26']]) });
    expect(markIds).toEqual(['o1234567zz']);
    expect(messages).toEqual([{
      memberId: I, keys: ['cov|o1234567zz'], kind: 'cov', title: 'Aries te cubrió',
      body: 'Aries cubrió Lavar trastes hoy. Le devuelves el turno el lunes 26.', tag: 'cov-o1234567'
    }]);
  });

  it('respeta meCubren y no avisa coberturas viejas', () => {
    const off = new Map([[I, { cover: { meCubren: false } }]]);
    expect(planCovered({ ...ctx, prefsByMember: off, covers: [cover], returns: new Map() }).messages).toEqual([]);
    const vieja = { ...cover, created_at: '2026-10-18T10:00:00Z' };
    expect(planCovered({ ...ctx, covers: [vieja], returns: new Map() })).toEqual({ messages: [], markIds: ['o1234567zz'] });
  });
});
