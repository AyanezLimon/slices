// Genera los íconos PNG de la PWA desde la geometría del Design System (media rodaja, gajo central asomándose).
// Uso: node scripts/icons.mjs   (los PNG quedan en public/icons y se suben al repo)
import fs from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const C = { fondo: '#0F3D2E', cascara: '#3E9B35', medula: '#F3F8E3', pulpa: '#CFE88A' };
const slice = (fill = true) => `
  <path fill="${fill ? C.cascara : '#FFFFFF'}" d="M52 350 A204 204 0 0 1 460 350 Z"/>
  ${fill ? `<path fill="${C.medula}" d="M70 350 A186 186 0 0 1 442 350 Z"/>` : ''}
  <path fill="${fill ? C.pulpa : 'none'}" stroke="${fill ? C.medula : '#000'}" stroke-width="12" stroke-linejoin="round" d="M240.0 350.0 L86.0 350.0 A170 170 0 0 1 118.5 250.1 L243.1 340.6 Z M243.1 340.6 L118.5 250.1 A170 170 0 0 1 203.5 188.3 L251.1 334.8 Z M260.9 334.8 L308.5 188.3 A170 170 0 0 1 393.5 250.1 L268.9 340.6 Z M268.9 340.6 L393.5 250.1 A170 170 0 0 1 426.0 350.0 L272.0 350.0 Z"/>
  <path fill="${fill ? C.pulpa : '#FFFFFF'}" stroke="${fill ? C.medula : 'none'}" stroke-width="12" stroke-linejoin="round" d="M251.1 290.8 L203.5 144.3 A170 170 0 0 1 308.5 144.3 L260.9 290.8 Z"/>`;

const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="114" fill="${C.fondo}"/>${slice()}</svg>`;
const square = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${C.fondo}"/>${slice()}</svg>`;
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${C.fondo}"/><g transform="translate(51.2 76.8) scale(0.8)">${slice()}</g></svg>`;
// Badge de Android: silueta blanca sobre transparente
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><g transform="translate(0 40)"><path fill="#FFFFFF" d="M52 350 A204 204 0 0 1 460 350 Z"/><path fill="#FFFFFF" d="M251.1 250.8 L203.5 104.3 A170 170 0 0 1 308.5 104.3 L260.9 250.8 Z"/></g></svg>`;

const out = 'public/icons';
fs.mkdirSync(out, { recursive: true });
const png = (svg, size, file) => fs.writeFileSync(`${out}/${file}`, new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng());

fs.writeFileSync(`${out}/icon.svg`, rounded);
png(rounded, 192, 'icon-192.png');
png(rounded, 512, 'icon-512.png');
png(maskable, 512, 'icon-maskable-512.png');
png(square, 180, 'apple-touch-icon.png');
png(badge, 96, 'badge-96.png');
console.log('Íconos generados en', out);
