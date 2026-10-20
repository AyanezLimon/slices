import { useInstall } from '../lib/install.js';
import { useEffect, useState } from 'preact/hooks';

// ───────────── Íconos de trazo (24px, stroke 2) ─────────────
const PATHS = {
  sol: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  ajustes: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M16 4v4M10 10v4M18 16v4',
  persona: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 21c0-4 4-6 8-6s8 2 8 6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  atras: 'M15 5l-7 7 7 7',
  mas: 'M12 5v14M5 12h14',
  campana: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0',
  telefono: 'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2',
  laptop: 'M4 5h16v10H4zM2 19h20',
  rotar: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5',
  arriba: 'M12 19V5M6 11l6-6 6 6',
  abajo: 'M12 5v14M6 13l6 6 6-6',
  compartir: 'M12 3v12M8 7l4-4 4 4M5 13v6h14v-6',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v5M12 8h.01',
  galeria: 'M3 5h18v14H3zM9 11a2 2 0 1 0 0-.01M21 16l-5-5-8 8',
  camara: 'M4 8h3l2-3h6l2 3h3v11H4zM12 9.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z'
};
export function Icon({ name, size = 24, strokeWidth = 2, label }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={strokeWidth}
      stroke-linecap="round" stroke-linejoin="round" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : 'true'}>
      <path d={PATHS[name]} />
    </svg>
  );
}

// ───────────── Avatares ─────────────
export const AVATAR_ICONS = {
  sol: PATHS.sol,
  luna: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  hoja: 'M5 19C5 10 10 5 20 4c-1 10-6 15-15 15zM5 19l8-8',
  estrella: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z',
  ola: 'M2 10c3 0 3-3 6.5-3S12 10 15 10s3.5-3 7-3M2 16c3 0 3-3 6.5-3S12 16 15 16s3.5-3 7-3',
  montana: 'M2 20L9 7l4 7 2-3 7 9z',
  flor: 'M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM12 9.5V4a3 3 0 0 1 0 5.5M14.5 12H20a3 3 0 0 1-5.5 0M12 14.5V20a3 3 0 0 1 0-5.5M9.5 12H4a3 3 0 0 1 5.5 0',
  rayo: 'M13 2L4 14h7l-1 8 9-12h-7z',
  corazon: 'M12 20s-8-4.8-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.2 12 20 12 20z',
  nube: 'M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z',
  planeta: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM3 15c-1.5 2.5 3 3 9 1s10.5-5.5 9-8c-.6-1-2.4-1.2-4.6-.8',
  gota: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z'
};

export function Avatar({ member, size = 40 }) {
  if (!member) return null;
  const a = member.avatar || {};
  const style = { width: `${size}px`, height: `${size}px`, background: `var(--persona-${member.color_index || 1})`, fontSize: `${Math.round(size * 0.4)}px` };
  if (a.type === 'photo' && a.url) return <span class="avatar" style={style}><img src={a.url} alt="" /></span>;
  if (a.type === 'icon' && AVATAR_ICONS[a.icon]) {
    return (
      <span class="avatar" style={style} aria-hidden="true">
        <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d={AVATAR_ICONS[a.icon]} /></svg>
      </span>
    );
  }
  return <span class="avatar" style={style} aria-hidden="true">{(member.name || '?').trim().charAt(0).toUpperCase()}</span>;
}

// ───────────── Controles ─────────────
export function Switch({ checked, onChange, label, disabled }) {
  return (
    <button type="button" role="switch" class="switch" aria-checked={checked ? 'true' : 'false'} aria-label={label}
      disabled={disabled} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

export function Segmented({ value, options, onChange, label }) {
  return (
    <div class="seg" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button type="button" role="radio" aria-checked={value === v ? 'true' : 'false'} onClick={() => onChange(v)}>{text}</button>
      ))}
    </div>
  );
}

export function Sheet({ onClose, label, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div class="sheet-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section class="sheet" role="dialog" aria-modal="true" aria-label={label}>
        <div class="grip" aria-hidden="true" />
        {children}
      </section>
    </div>
  );
}

// ───────────── Toast ─────────────
let pushToast = () => {};
export const toast = (msg) => pushToast(msg);
export function Toaster() {
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    let t;
    pushToast = (m) => { setMsg(m); clearTimeout(t); t = setTimeout(() => setMsg(null), 3800); };
    return () => { pushToast = () => {}; };
  }, []);
  return msg ? <div class="toast" role="status">{msg}</div> : null;
}

/** Ejecuta una acción mostrando el error como toast. */
export async function attempt(fn, ok) {
  try {
    const r = await fn();
    if (ok) toast(ok);
    return r;
  } catch (e) {
    toast(e.message || 'Algo salió mal');
    return undefined;
  }
}

// ───────────── Medidor (media rodaja) ─────────────
function wedge(i, n, lift) {
  const a0 = Math.PI + (i * Math.PI) / n, a1 = Math.PI + ((i + 1) * Math.PI) / n, m = (a0 + a1) / 2;
  const dx = lift * Math.cos(m), dy = lift * Math.sin(m);
  const p = (r, a) => `${(256 + dx + r * Math.cos(a)).toFixed(1)} ${(350 + dy + r * Math.sin(a)).toFixed(1)}`;
  return `M${p(16, a0)} L${p(170, a0)} A170 170 0 0 1 ${p(170, a1)} L${p(16, a1)} Z `;
}

/** segs: array de 'done' | 'todo' | 'mine' (máx. 8; se escala si hay más). */
export function Gauge({ total, doneCount, mineFirst, width = 132, label }) {
  const n = Math.max(1, Math.min(8, total));
  const scaledDone = total <= 8 ? doneCount : Math.round((doneCount * 8) / total);
  let done = '', todo = '', mine = '';
  for (let i = 0; i < n; i++) {
    if (i < scaledDone) done += wedge(i, n, 0);
    else if (mineFirst && i === scaledDone) mine = wedge(i, n, 30);
    else todo += wedge(i, n, 0);
  }
  return (
    <svg viewBox="40 110 432 246" width={width} height={(width * 246) / 432} role="img" aria-label={label}>
      <path d="M52 350 A204 204 0 0 1 460 350 Z" fill="var(--cascara)" />
      <path d="M70 350 A186 186 0 0 1 442 350 Z" fill="var(--superficie-tenue)" />
      <path d={done} fill="var(--pulpa)" stroke="var(--superficie-tenue)" stroke-width="12" stroke-linejoin="round" />
      <path d={todo} fill="var(--pendiente)" stroke="var(--superficie-tenue)" stroke-width="12" stroke-linejoin="round" />
      <path d={mine} fill="var(--marca)" stroke="var(--superficie-tenue)" stroke-width="12" stroke-linejoin="round" />
    </svg>
  );
}

export function AppMark({ size = 72 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <rect width="512" height="512" rx="114" fill="#0F3D2E" />
      <path fill="#3E9B35" d="M52 350 A204 204 0 0 1 460 350 Z" />
      <path fill="#F3F8E3" d="M70 350 A186 186 0 0 1 442 350 Z" />
      <path fill="#CFE88A" stroke="#F3F8E3" stroke-width="12" stroke-linejoin="round" d="M240.0 350.0 L86.0 350.0 A170 170 0 0 1 118.5 250.1 L243.1 340.6 Z M243.1 340.6 L118.5 250.1 A170 170 0 0 1 203.5 188.3 L251.1 334.8 Z M260.9 334.8 L308.5 188.3 A170 170 0 0 1 393.5 250.1 L268.9 340.6 Z M268.9 340.6 L393.5 250.1 A170 170 0 0 1 426.0 350.0 L272.0 350.0 Z" />
      <path fill="#CFE88A" stroke="#F3F8E3" stroke-width="12" stroke-linejoin="round" d="M251.1 290.8 L203.5 144.3 A170 170 0 0 1 308.5 144.3 L260.9 290.8 Z" />
    </svg>
  );
}

export function InstallCard() {
  const { kind, install, dismiss } = useInstall();
  if (!kind) return null;
  return (
    <div class="card" role="note">
      <div class="stack-sm">
        <span class="tarea" style="font-size:15px">Instala Slices en tu pantalla de inicio</span>
        <span class="meta">
          {kind === 'ios'
            ? 'Toca Compartir (el cuadro con la flecha hacia arriba) y luego "Agregar a inicio". Ábrela siempre desde ese ícono para recibir avisos.'
            : 'Se abre como una app y puede mandarte avisos.'}
        </span>
      </div>
      <div class="btn-row">
        {kind === 'prompt' && <button class="btn btn-primario" type="button" onClick={install}>Instalar</button>}
        <button class="btn btn-texto" type="button" onClick={dismiss}>Ahora no</button>
      </div>
    </div>
  );
}
