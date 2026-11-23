#!/usr/bin/env node
/**
 * Generates the 100 royal level badges (levels 1..100) shipped in
 * `web/public/levels/level-<n>.png`.
 *
 * Every badge shares one skeleton taken from the reference artwork — crown on
 * top, fanned wings behind the medallion, big level number with "Lv." under it,
 * golden hands cradling a ruby, ornamented base — and each level gets its own
 * palette, gem colours, crown height, wing span, ring jewels, aura and sparkles.
 * Ten bands (bronze, steel, gold, emerald, sapphire, amethyst, ruby, obsidian,
 * celestial, legendary) grow richer level by level, so no two badges repeat.
 *
 * Usage (inside the web container, or anywhere Node 20+ runs):
 *   npm i --no-save @resvg/resvg-js
 *   BADGE_FONT_DIR=/path/with/Cinzel/fonts node scripts/generate-level-badges.mjs
 *
 * Fonts: Cinzel Decorative Bold + Cinzel (SIL Open Font License), downloaded
 * from https://github.com/google/fonts. Only needed to regenerate the artwork;
 * the committed PNGs are self-contained.
 *
 * Flags: --svg (also write the vector source), --only 1,50,100
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(HERE, '../public/levels');
const FONT_DIR = process.env.BADGE_FONT_DIR || '/tmp/badge-fonts';
const RENDER = 384;

const args = process.argv.slice(2);
const writeSvg = args.includes('--svg');
const onlyArg = args.indexOf('--only');
const only = onlyArg >= 0 ? new Set(String(args[onlyArg + 1] || '').split(',').map(Number)) : null;

/* ------------------------------------------------------------------ colours */

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbToHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
function mix(a, b, t) {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}
const lighten = (c, t) => mix(c, '#ffffff', t);
const darken = (c, t) => mix(c, '#000000', t);

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h * 360, s * 100, l * 100];
}
function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360; s /= 100; l /= 100;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [hue(h + 1 / 3) * 255, hue(h) * 255, hue(h - 1 / 3) * 255];
}
function shiftHue(hex, deg) {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  const [r2, g2, b2] = hslToRgb(h + deg, s, l);
  return rgbToHex(r2, g2, b2);
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* -------------------------------------------------------------------- bands */

const BANDS = [
  {
    key: 'bronze',
    metal: ['#ffdcae', '#e2a458', '#a4661e', '#5b330c'],
    accent: '#ff9b3d',
    gems: ['#e0413f', '#ff7a3d', '#c22a4a', '#ffae66'],
    points: 3, feathers: 3,
  },
  {
    key: 'steel',
    metal: ['#f4f8ff', '#c3d0e4', '#7d8ca6', '#3b4657'],
    accent: '#8fd4ff',
    gems: ['#5ec8ff', '#8fb7ff', '#4a7dff', '#b8e6ff'],
    points: 4, feathers: 4,
  },
  {
    key: 'gold',
    metal: ['#fff3b0', '#ffd75e', '#c08b1a', '#6b4708'],
    accent: '#ffcf4d',
    gems: ['#ff8f2e', '#ffd35e', '#e8a020', '#fff0a8'],
    points: 5, feathers: 5,
  },
  {
    key: 'emerald',
    metal: ['#c9ffe4', '#7fe3ae', '#2c9a6b', '#0d4a33'],
    accent: '#3ddc97',
    gems: ['#26e08a', '#7dffc4', '#0fa86a', '#c8ffe6'],
    points: 5, feathers: 6,
  },
  {
    key: 'sapphire',
    metal: ['#cfe0ff', '#8fb4ff', '#3b63c9', '#182a6b'],
    accent: '#5b8cff',
    gems: ['#3d7dff', '#7fb0ff', '#1f4fd1', '#c6dcff'],
    points: 6, feathers: 7,
  },
  {
    key: 'amethyst',
    metal: ['#e8d4ff', '#c08fff', '#7a3ec9', '#3a1668'],
    accent: '#b06bff',
    gems: ['#a45bff', '#d7a8ff', '#7426d1', '#ead4ff'],
    points: 6, feathers: 8,
  },
  {
    key: 'ruby',
    metal: ['#ffd4d9', '#ff8f9f', '#c92a4a', '#6b0f22'],
    accent: '#ff3b6b',
    gems: ['#ff2d55', '#ff7a8f', '#b8002e', '#ffd0d8'],
    points: 7, feathers: 9,
  },
  {
    key: 'obsidian',
    metal: ['#cfc9e2', '#8a82a6', '#4a4460', '#1a1626'],
    accent: '#8a2be2',
    gems: ['#9b4dff', '#6a2bd1', '#c9a0ff', '#3a1a66'],
    points: 7, feathers: 10,
  },
  {
    key: 'celestial',
    metal: ['#eaf7ff', '#b9e8ff', '#6aa8d8', '#22415e'],
    accent: '#7fe6ff',
    gems: ['#9ff0ff', '#d9fbff', '#4fb8e0', '#ffffff'],
    points: 8, feathers: 11,
  },
  {
    key: 'legendary',
    metal: ['#fff6cf', '#ffd75e', '#e08a1a', '#8a3b00'],
    accent: '#ff2bd6',
    gems: ['#ff2bd6', '#ff5b8f', '#c0009e', '#fff0b8'],
    points: 9, feathers: 13,
  },
];

function themeFor(level) {
  const tier = Math.min(10, Math.ceil(level / 10));
  const idx = (level - 1) % 10;
  const band = BANDS[tier - 1];
  const isLast = level === 100;
  // Each level inside a band drifts its hue and picks its own jewel colours.
  const drift = (idx - 4.5) * 5.5;
  const metal = band.metal.map((c) => shiftHue(c, drift));
  if (isLast) {
    metal.splice(0, 4, '#fffbe0', '#ffe27a', '#ff9f1a', '#a83c00');
  }
  const accent = shiftHue(band.accent, isLast ? 0 : drift * 0.7);
  const gem = isLast ? '#ff2bd6' : band.gems[idx % band.gems.length];
  const gemAlt = isLast ? '#ff5b8f' : band.gems[(idx + 2) % band.gems.length];
  return {
    level,
    tier,
    idx,
    band: band.key,
    metal,
    dark: darken(metal[3], 0.45),
    accent,
    gem,
    gemLight: lighten(gem, 0.42),
    gemDeep: darken(gem, 0.45),
    gemAlt,
    gemAltLight: lighten(gemAlt, 0.35),
    points: band.points + (idx >= 4 ? 1 : 0) + (idx >= 8 ? 1 : 0),
    feathers: band.feathers + (idx >= 3 ? 1 : 0) + (idx >= 7 ? 1 : 0),
    crownH: 56 + tier * 4.2 + idx * 0.8 + (isLast ? 8 : 0),
    featherLen: 114 + tier * 5.2 + idx * 1.5 + (isLast ? 10 : 0),
    auraR: 208 + tier * 4 + idx,
    auraOpacity: 0.32 + tier * 0.022 + idx * 0.006,
    ringGems: 6 + tier + Math.floor(idx / 2) + (isLast ? 2 : 0),
    rays: 16 + idx * 2,
    sparkles: 3 + tier + (idx % 3) + (isLast ? 4 : 0),
    ringStyle: idx % 3,
  };
}

/* ---------------------------------------------------------------- geometry */

const CX = 256;
const CY = 300;
const R = 106;
const RI = 88;

function featherPath(len, w) {
  return `M 0 ${(-w * 0.4).toFixed(2)}
    C ${(len * 0.2).toFixed(2)} ${(-w * 1.5).toFixed(2)} ${(len * 0.66).toFixed(2)} ${(-w * 1.25).toFixed(2)} ${len.toFixed(2)} ${(-w * 0.15).toFixed(2)}
    C ${(len * 0.72).toFixed(2)} ${(w * 0.8).toFixed(2)} ${(len * 0.24).toFixed(2)} ${(w * 0.9).toFixed(2)} 0 ${(w * 0.5).toFixed(2)} Z`;
}

function starPath(s) {
  const k = s * 0.24;
  return `M 0 ${-s} L ${k} ${-k} L ${s} 0 L ${k} ${k} L 0 ${s} L ${-k} ${k} L ${-s} 0 L ${-k} ${-k} Z`;
}

function defs(t) {
  return `<defs>
  <linearGradient id="metal" x1="0.1" y1="0" x2="0.9" y2="1">
    <stop offset="0" stop-color="${t.metal[0]}"/>
    <stop offset="0.36" stop-color="${t.metal[1]}"/>
    <stop offset="0.7" stop-color="${t.metal[2]}"/>
    <stop offset="1" stop-color="${t.metal[3]}"/>
  </linearGradient>
  <linearGradient id="metalSoft" x1="0" y1="0" x2="0.4" y2="1">
    <stop offset="0" stop-color="${t.metal[1]}"/>
    <stop offset="0.55" stop-color="${t.metal[2]}"/>
    <stop offset="1" stop-color="${t.metal[3]}"/>
  </linearGradient>
  <linearGradient id="num" x1="0" y1="0" x2="0.15" y2="1">
    <stop offset="0" stop-color="#ffffff"/>
    <stop offset="0.3" stop-color="${t.metal[0]}"/>
    <stop offset="0.66" stop-color="${t.metal[1]}"/>
    <stop offset="1" stop-color="${lighten(t.metal[2], 0.2)}"/>
  </linearGradient>
  <radialGradient id="inner" cx="0.5" cy="0.4" r="0.66">
    <stop offset="0" stop-color="#251a30"/>
    <stop offset="0.62" stop-color="#120c18"/>
    <stop offset="1" stop-color="#060309"/>
  </radialGradient>
  <radialGradient id="aura" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="${t.accent}" stop-opacity="${(t.auraOpacity * 1.4).toFixed(2)}"/>
    <stop offset="0.46" stop-color="${t.accent}" stop-opacity="${(t.auraOpacity * 0.55).toFixed(2)}"/>
    <stop offset="1" stop-color="${t.accent}" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="gem" cx="0.36" cy="0.28" r="0.85">
    <stop offset="0" stop-color="${t.gemLight}"/>
    <stop offset="0.45" stop-color="${t.gem}"/>
    <stop offset="1" stop-color="${t.gemDeep}"/>
  </radialGradient>
  <radialGradient id="gemAlt" cx="0.36" cy="0.28" r="0.85">
    <stop offset="0" stop-color="${t.gemAltLight}"/>
    <stop offset="0.5" stop-color="${t.gemAlt}"/>
    <stop offset="1" stop-color="${darken(t.gemAlt, 0.45)}"/>
  </radialGradient>
  <filter id="soft" x="-60%" y="-60%" width="220%" height="220%">
    <feGaussianBlur stdDeviation="9"/>
  </filter>
  <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
    <feGaussianBlur stdDeviation="3.4"/>
  </filter>
</defs>`;
}

function aura(t) {
  return `<circle cx="${CX}" cy="${CY}" r="${t.auraR}" fill="url(#aura)"/>
  <circle cx="${CX}" cy="${CY}" r="${R + 14}" fill="none" stroke="${t.accent}" stroke-opacity="0.34" stroke-width="2.4" filter="url(#glow)"/>`;
}

function wings(t) {
  const n = t.feathers;
  let s = '';
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0 : i / (n - 1);
    const angle = 197 + f * 55;
    const len = t.featherLen * (1 - 0.28 * f);
    const w = 17 - 4.5 * f;
    s += `<g transform="translate(-38 296) rotate(${angle.toFixed(1)})">
      <path d="${featherPath(len, w)}" fill="url(#metal)" stroke="${t.dark}" stroke-width="2.6" stroke-opacity="0.55" stroke-linejoin="round"/>
      <path d="${featherPath(len * 0.8, w * 0.58)}" transform="translate(${(len * 0.08).toFixed(1)} ${(w * 0.55).toFixed(1)})" fill="url(#gemAlt)" fill-opacity="0.4"/>
    </g>`;
  }
  return `<g transform="translate(${CX} 0)">${s}<g transform="scale(-1 1)">${s}</g></g>`;
}

function halo(t) {
  if (t.tier < 9) return '';
  const cy = CY - R + 34;
  return `<ellipse cx="${CX}" cy="${cy}" rx="${118 + t.tier * 2}" ry="24" fill="none" stroke="${t.accent}" stroke-opacity="0.55" stroke-width="3" filter="url(#glow)"/>
  <ellipse cx="${CX}" cy="${cy}" rx="${104 + t.tier * 2}" ry="17" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="1.6"/>`;
}

function medallion(t) {
  let jewels = '';
  const n = t.ringGems;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const x = CX + Math.cos(a) * (R - 7.5);
    const y = CY + Math.sin(a) * (R - 7.5);
    const rot = (a * 180) / Math.PI + 90;
    const fill = i % 2 === 0 ? 'url(#gem)' : 'url(#metal)';
    jewels += `<path d="M 0 -6.4 L 4.8 0 L 0 6.4 L -4.8 0 Z" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(1)})" fill="${fill}" stroke="${t.dark}" stroke-width="1.1"/>`;
  }
  let rays = '';
  for (let i = 0; i < t.rays; i++) {
    const a = (i / t.rays) * Math.PI * 2;
    const x1 = CX + Math.cos(a) * 32;
    const y1 = CY + Math.sin(a) * 32;
    const x2 = CX + Math.cos(a) * (RI - 7);
    const y2 = CY + Math.sin(a) * (RI - 7);
    rays += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${t.accent}" stroke-opacity="0.16" stroke-width="1.7"/>`;
  }
  let filigree = '';
  if (t.ringStyle === 0) filigree = `stroke-dasharray="4 7"`;
  else if (t.ringStyle === 1) filigree = `stroke-dasharray="14 6"`;
  return `<circle cx="${CX}" cy="${CY}" r="${R}" fill="url(#metal)" stroke="${t.dark}" stroke-width="4"/>
  <circle cx="${CX}" cy="${CY}" r="${R - 10}" fill="none" stroke="#ffffff" stroke-opacity="0.34" stroke-width="2"/>
  <circle cx="${CX}" cy="${CY}" r="${R - 14}" fill="none" stroke="${t.dark}" stroke-opacity="0.45" stroke-width="1.6"/>
  ${jewels}
  <circle cx="${CX}" cy="${CY}" r="${RI}" fill="url(#inner)" stroke="${t.metal[1]}" stroke-width="2.6"/>
  ${rays}
  <circle cx="${CX}" cy="${CY}" r="${RI - 10}" fill="none" stroke="${t.accent}" stroke-opacity="0.4" stroke-width="1.5" ${filigree}/>`;
}

function crown(t) {
  const bandW = 136 + t.tier * 3;
  const bandH = 26;
  const bandY = CY - R + 10 - bandH;
  const n = t.points;
  const spread = bandW * 0.8;
  const mid = (n - 1) / 2;
  const tw = Math.min(30, (spread / Math.max(1, n - 1)) * 1.45);
  let points = '';
  let bandJewels = '';
  for (let i = 0; i < n; i++) {
    const x = CX + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread);
    const dist = mid === 0 ? 0 : Math.abs(i - mid) / mid;
    const h = t.crownH * (1 - 0.42 * dist);
    points += `<path d="M ${(x - tw / 2).toFixed(1)} ${bandY + 7}
      Q ${(x - tw * 0.2).toFixed(1)} ${(bandY - h * 0.55).toFixed(1)} ${x.toFixed(1)} ${(bandY - h).toFixed(1)}
      Q ${(x + tw * 0.2).toFixed(1)} ${(bandY - h * 0.55).toFixed(1)} ${(x + tw / 2).toFixed(1)} ${bandY + 7} Z"
      fill="url(#metal)" stroke="${t.dark}" stroke-width="2.3" stroke-linejoin="round"/>`;
    points += `<circle cx="${x.toFixed(1)}" cy="${(bandY - h - 4).toFixed(1)}" r="${(4.4 + t.tier * 0.22).toFixed(1)}" fill="${i === Math.round(mid) ? 'url(#gem)' : 'url(#metal)'}" stroke="${t.dark}" stroke-width="1.6"/>`;
    bandJewels += `<circle cx="${x.toFixed(1)}" cy="${bandY + bandH * 0.5}" r="4.4" fill="${i % 2 === 0 ? 'url(#gem)' : 'url(#gemAlt)'}" stroke="${t.dark}" stroke-width="1.1"/>`;
  }
  const spikes = t.tier >= 8
    ? `<path d="M ${CX - bandW / 2 - 10} ${bandY + bandH} L ${CX - bandW / 2 - 30} ${bandY + bandH - 16} L ${CX - bandW / 2 - 6} ${bandY + 2} Z" fill="url(#metal)" stroke="${t.dark}" stroke-width="2"/>
       <path d="M ${CX + bandW / 2 + 10} ${bandY + bandH} L ${CX + bandW / 2 + 30} ${bandY + bandH - 16} L ${CX + bandW / 2 + 6} ${bandY + 2} Z" fill="url(#metal)" stroke="${t.dark}" stroke-width="2"/>`
    : '';
  return `${spikes}${points}
  <rect x="${(CX - bandW / 2).toFixed(1)}" y="${bandY}" width="${bandW.toFixed(1)}" height="${bandH}" rx="9" fill="url(#metal)" stroke="${t.dark}" stroke-width="3"/>
  <rect x="${(CX - bandW / 2 + 6).toFixed(1)}" y="${bandY + 5}" width="${(bandW - 12).toFixed(1)}" height="${bandH - 10}" rx="6" fill="none" stroke="${t.accent}" stroke-opacity="0.55" stroke-width="1.5"/>
  ${bandJewels}
  <circle cx="${CX}" cy="${bandY + bandH / 2}" r="${6.4 + t.tier * 0.2}" fill="url(#gem)" stroke="${t.dark}" stroke-width="2"/>
  <circle cx="${CX - 2.4}" cy="${bandY + bandH / 2 - 2.4}" r="2" fill="#ffffff" fill-opacity="0.75"/>`;
}

function numerals(t) {
  const digits = String(t.level).length;
  const size = digits >= 3 ? 92 : digits === 2 ? 112 : 122;
  const capH = size * 0.72;
  const blockH = capH + 34;
  const top = CY - blockH / 2;
  const numY = top + capH;
  const lvY = numY + 30;
  return `<text x="${CX}" y="${numY.toFixed(1)}" text-anchor="middle" font-family="Cinzel Decorative" font-weight="700" font-size="${size}" fill="none" stroke="${t.dark}" stroke-width="${(size * 0.075).toFixed(1)}" stroke-linejoin="round">${t.level}</text>
  <text x="${CX}" y="${numY.toFixed(1)}" text-anchor="middle" font-family="Cinzel Decorative" font-weight="700" font-size="${size}" fill="url(#num)">${t.level}</text>
  <text x="${CX}" y="${(numY - size * 0.035).toFixed(1)}" text-anchor="middle" font-family="Cinzel Decorative" font-weight="700" font-size="${size}" fill="#fffdf0" fill-opacity="0.26">${t.level}</text>
  <text x="${CX - 3}" y="${lvY.toFixed(1)}" text-anchor="middle" font-family="Cinzel" font-size="24" letter-spacing="7" fill="${t.metal[0]}" stroke="${t.dark}" stroke-width="1.1">Lv.</text>`;
}

function hand(t) {
  const fingers = [
    [199, 444, -25, 50],
    [211, 448, -12, 55],
    [223, 448, 1, 53],
    [234, 441, 13, 44],
  ];
  let f = '';
  for (const [x, y, rot, h] of fingers) {
    f += `<rect x="-6.6" y="${-h}" width="13.2" height="${h}" rx="6.6" transform="translate(${x} ${y}) rotate(${rot})"/>`;
  }
  f += `<rect x="-7" y="-37" width="14" height="37" rx="7" transform="translate(186 458) rotate(-63)"/>`;
  return `<g fill="url(#metal)" stroke="${t.dark}" stroke-width="2.5" stroke-opacity="0.6" stroke-linejoin="round">
    <path d="M 186 471 C 172 463 170 446 179 436 C 188 426 202 424 214 431 C 224 436 228 448 227 459 C 226 469 216 475 204 473 Z"/>
    ${f}
  </g>
  <g fill="none" stroke="#ffffff" stroke-opacity="0.28" stroke-width="1.6" stroke-linecap="round">
    <path d="M 191 446 C 197 439 207 436 215 441"/>
    <path d="M 196 430 C 205 427 214 431 218 438"/>
  </g>`;
}

function gemCluster(t) {
  const gx = CX;
  const gy = 424;
  const gw = 34;
  const gh = 30;
  return `<ellipse cx="${gx}" cy="${gy}" rx="48" ry="42" fill="${t.accent}" opacity="0.32" filter="url(#soft)"/>
  <path d="M ${gx} ${gy - gh} L ${gx + gw} ${gy - gh * 0.35} L ${gx + gw * 0.62} ${gy + gh * 0.85} L ${gx - gw * 0.62} ${gy + gh * 0.85} L ${gx - gw} ${gy - gh * 0.35} Z"
    fill="url(#gem)" stroke="${t.dark}" stroke-width="2.6" stroke-linejoin="round"/>
  <path d="M ${gx} ${gy - gh} L ${gx - gw} ${gy - gh * 0.35} L ${gx - gw * 0.62} ${gy + gh * 0.85} L ${gx - gw * 0.1} ${gy + gh * 0.1} Z" fill="#ffffff" opacity="0.22"/>
  <path d="M ${gx} ${gy - gh} L ${gx + gw} ${gy - gh * 0.35} L ${gx + gw * 0.62} ${gy + gh * 0.85}" fill="none" stroke="#ffffff" stroke-opacity="0.4" stroke-width="1.7"/>
  <path d="M ${gx - gw * 0.62} ${gy + gh * 0.85} L ${gx + gw * 0.62} ${gy + gh * 0.85}" stroke="${t.gemDeep}" stroke-opacity="0.7" stroke-width="1.6"/>
  <circle cx="${gx - 9}" cy="${gy - 13}" r="3" fill="#ffffff" opacity="0.75"/>`;
}

function base(t) {
  return `<path d="M 190 468 Q 222 460 256 464 Q 290 460 322 468 L 316 493 Q 256 484 196 493 Z"
    fill="url(#metalSoft)" stroke="${t.dark}" stroke-width="2.6" stroke-linejoin="round"/>
  <circle cx="${CX}" cy="484" r="9" fill="url(#gem)" stroke="${t.dark}" stroke-width="2"/>
  <circle cx="208" cy="487" r="4.6" fill="url(#metal)" stroke="${t.dark}" stroke-width="1.4"/>
  <circle cx="304" cy="487" r="4.6" fill="url(#metal)" stroke="${t.dark}" stroke-width="1.4"/>`;
}

function sparkles(t) {
  const rnd = mulberry32(t.level * 7919 + 13);
  let s = '';
  for (let i = 0; i < t.sparkles; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 128 + rnd() * 108;
    const x = CX + Math.cos(a) * r;
    const y = CY + Math.sin(a) * r * 0.9;
    const size = 5 + rnd() * 7;
    const gold = i % 3 === 0;
    s += `<path d="${starPath(size)}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(rnd() * 90).toFixed(0)})" fill="${gold ? t.accent : '#ffffff'}" fill-opacity="${gold ? 0.9 : 0.62}"/>`;
  }
  return s;
}

function ribbons(t) {
  if (t.tier < 10) return '';
  return `<path d="M 198 478 C 156 490 132 504 104 500" stroke="${t.accent}" stroke-width="10" fill="none" stroke-linecap="round" opacity="0.7"/>
  <path d="M 314 478 C 356 490 380 504 408 500" stroke="${t.accent}" stroke-width="10" fill="none" stroke-linecap="round" opacity="0.7"/>`;
}

function buildSvg(level) {
  const t = themeFor(level);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${RENDER}" height="${RENDER}" viewBox="0 0 512 512">
${defs(t)}
${aura(t)}
${ribbons(t)}
${wings(t)}
${halo(t)}
${medallion(t)}
${crown(t)}
${numerals(t)}
${base(t)}
<g transform="translate(512 0) scale(-1 1)">${hand(t)}</g>
${hand(t)}
${gemCluster(t)}
${sparkles(t)}
</svg>`;
}

/* ------------------------------------------------------------------- render */

let Resvg = null;
try {
  ({ Resvg } = await import('@resvg/resvg-js'));
} catch {
  /* PNG rendering needs the optional dev dependency */
}

const fontFiles = ['CinzelDecorative-Bold.ttf', 'Cinzel.ttf']
  .map((name) => path.join(FONT_DIR, name))
  .filter((file) => fs.existsSync(file));

if (!Resvg) {
  console.error('Missing @resvg/resvg-js — run: npm i --no-save @resvg/resvg-js');
  process.exit(1);
}
if (fontFiles.length < 2) {
  console.error(`Missing badge fonts in ${FONT_DIR} (CinzelDecorative-Bold.ttf, Cinzel.ttf)`);
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const levels = only ? [...only] : Array.from({ length: 100 }, (_, i) => i + 1);
let bytes = 0;
for (const level of levels) {
  const svg = buildSvg(level);
  const resvg = new Resvg(svg, {
    font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Cinzel' },
    fitTo: { mode: 'width', value: RENDER },
    background: 'rgba(0,0,0,0)',
  });
  const png = resvg.render().asPng();
  fs.writeFileSync(path.join(OUT_DIR, `level-${level}.png`), png);
  if (writeSvg) fs.writeFileSync(path.join(OUT_DIR, `level-${level}.svg`), svg);
  bytes += png.length;
}
console.log(`rendered ${levels.length} badges → ${OUT_DIR} (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
