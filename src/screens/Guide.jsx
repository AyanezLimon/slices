import { useState } from 'preact/hooks';
import { isIOS, isStandalone, permission, sendTest } from '../lib/push.js';
import { Icon, Segmented, attempt } from '../components/ui.jsx';

const STEPS = {
  ios: [
    { id: 'i1', title: 'Agregar a la pantalla de inicio', how: 'En Safari: Compartir → Agregar a inicio. Ábrela siempre desde ese ícono.', auto: isStandalone },
    { id: 'i2', title: 'Permitir notificaciones', how: 'En tu Perfil toca "Activar avisos aquí" y elige Permitir.', auto: () => permission() === 'granted' },
    { id: 'i3', title: 'Mostrar en pantalla bloqueada', how: 'Ajustes → Notificaciones → Slices → activa Pantalla bloqueada y Sonidos.' },
    { id: 'i4', title: 'Permitir en Concentración', how: 'Ajustes → Concentración → No molestar / Dormir → Apps permitidas → agrega Slices.' },
    { id: 'i5', title: 'Entrega inmediata', how: 'Ajustes → Notificaciones → Slices → Entrega inmediata (no en resumen programado).' }
  ],
  android: [
    { id: 'a1', title: 'Instalar la app', how: 'En Chrome: menú ⋮ → Instalar app (o Agregar a pantalla principal).', auto: isStandalone },
    { id: 'a2', title: 'Permitir notificaciones', how: 'En tu Perfil toca "Activar avisos aquí" y elige Permitir.', auto: () => permission() === 'granted' },
    { id: 'a3', title: 'Chrome sin restricción de batería', how: 'Ajustes → Apps → Chrome → Batería → Sin restricciones.' },
    { id: 'a4', title: 'Samsung, Xiaomi o Huawei', how: 'Quita Chrome de "Apps en suspensión profunda" o activa Inicio automático para Chrome.' },
    { id: 'a5', title: 'Avisos con sonido', how: 'Mantén presionado un aviso de Slices → Configuración → Predeterminado (no Silencioso).' }
  ]
};
const KEY = 'slices-guia';

export function Guide() {
  const [os, setOs] = useState(isIOS() ? 'ios' : 'android');
  const [done, setDone] = useState(() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } });
  const [sent, setSent] = useState(false);
  const mark = (id) => {
    const next = { ...done, [id]: !done[id] };
    setDone(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) { /* */ }
  };
  const steps = STEPS[os].map((s) => ({ ...s, ok: s.auto ? s.auto() : Boolean(done[s.id]) }));
  const count = steps.filter((s) => s.ok).length;

  return (
    <main class="screen">
      <a href="#/perfil" class="row" style="gap:4px;min-height:44px;align-self:flex-start"><Icon name="atras" size={20} />Perfil</a>
      <div class="stack-sm">
        <h1 class="titulo">Que lleguen los avisos</h1>
        <p class="muted">Para que suenen con el celular bloqueado. Lo marcado como "Detectado" la app lo revisa sola.</p>
      </div>
      <Segmented label="Sistema" value={os} onChange={setOs} options={[['ios', 'iPhone'], ['android', 'Android']]} />
      <div class="row">
        <div class="grow" style="height:8px;border-radius:99px;background:var(--pendiente);overflow:hidden">
          <div style={`height:8px;border-radius:99px;background:var(--cascara);width:${Math.round((count / steps.length) * 100)}%`} />
        </div>
        <span class="meta" style="font-weight:700">{count} de {steps.length}</span>
      </div>
      <ol class="stack" style="list-style:none;margin:0;padding:0">
        {steps.map((s, i) => (
          <li class="card" style="flex-direction:row;align-items:flex-start">
            <span aria-hidden="true" style={`width:30px;height:30px;flex:none;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;${s.ok ? 'background:var(--primario);color:var(--sobre-primario)' : 'border:2px solid var(--borde-control);color:var(--tinta-suave)'}`}>
              {s.ok ? <Icon name="check" size={16} strokeWidth={3} /> : i + 1}
            </span>
            <div class="grow stack-sm">
              <span class="tarea" style="font-size:15px">{s.title}</span>
              <span class="meta">{s.how}</span>
              {s.auto
                ? <span class={`chip ${s.ok ? 'chip-hecha' : 'chip-neutro'}`} style="margin-top:4px">{s.ok ? 'Detectado' : 'Pendiente'}</span>
                : <button type="button" class="btn btn-secundario" style="align-self:flex-start;margin-top:4px;font-size:13px" aria-pressed={s.ok ? 'true' : 'false'} onClick={() => mark(s.id)}>{s.ok ? 'Hecho' : 'Ya lo hice'}</button>}
            </div>
          </li>
        ))}
      </ol>
      <div class="stack-sm" style="text-align:center">
        <button class="btn btn-primario" type="button" onClick={() => attempt(() => sendTest().then(() => setSent(true)))}>
          {sent ? '¿Lo viste? Probar otra vez' : 'Probar con el celular bloqueado'}
        </button>
        <span class="meta">{sent ? 'Si no apareció en la pantalla bloqueada, revisa los pasos sin marcar.' : 'Toca y bloquea el teléfono enseguida.'}</span>
      </div>
    </main>
  );
}
