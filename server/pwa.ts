// V0.2.2 · Manifiesto web e íconos por negocio para la PWA de la tarjeta.
// Solo usa datos públicos del negocio (nombre y colores). Nunca incluye tokens ni datos del cliente.
// Los íconos PNG se dibujan aquí mismo (sin dependencias): fondo con el color del negocio, un aro de
// "sello" con el color de acento y la inicial del negocio.
import { deflateSync } from 'node:zlib';
import type { PublicBusiness } from './services/businesses';

export function shortName(name: string) {
  const clean = name.replace(/\s+/g, ' ').trim();
  if (clean.length <= 12) return clean;
  const first = clean.split(' ').filter((w) => !/^(demo|de|la|el|los|las|y)$/i.test(w));
  const two = first.slice(0, 2).join(' ');
  return (two.length <= 12 ? two : first[0] ?? clean).slice(0, 12);
}

export function buildManifest(b: Pick<PublicBusiness, 'slug' | 'name' | 'primaryColor' | 'accentColor'>) {
  const base = `/api/pwa/${b.slug}/icon`;
  return {
    // id y scope por negocio: cada tarjeta se identifica como su propia app instalada.
    id: `/n/${b.slug}`,
    name: `${b.name} · Tarjeta`,
    short_name: shortName(b.name),
    description: `Tu tarjeta de recompensas de ${b.name}.`,
    lang: 'es-MX',
    dir: 'ltr',
    start_url: `/n/${b.slug}?fuente=app`,
    scope: `/n/${b.slug}`,
    display: 'standalone',
    orientation: 'portrait',
    background_color: b.primaryColor,
    theme_color: b.primaryColor,
    categories: ['shopping', 'lifestyle'],
    prefer_related_applications: false,
    icons: [
      { src: `${base}/192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${base}/512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `${base}/maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

/**
 * V0.4 · Manifiesto del personal: "Panel" (dueño) o "Caja" (empleado) como app en la pantalla de inicio.
 * Usa los colores e inicial del negocio. El acceso sigue protegido por el inicio de sesión propio
 * (cookie HttpOnly vlx_staff): el manifiesto no da permisos, solo un acceso directo.
 */
export function buildStaffManifest(b: Pick<PublicBusiness, 'slug' | 'name' | 'primaryColor' | 'accentColor'>, app: 'panel' | 'caja') {
  const base = `/api/pwa/${b.slug}/icon`;
  const label = app === 'panel' ? 'Panel' : 'Caja';
  return {
    id: `/${app}?negocio=${b.slug}`,
    name: `${b.name} · ${label}`,
    short_name: `${label} ${shortName(b.name)}`.slice(0, 12),
    description: app === 'panel' ? `Panel del dueño de ${b.name}: clientes, métricas y programa.` : `Caja de ${b.name}: escanea tarjetas y registra visitas.`,
    lang: 'es-MX',
    dir: 'ltr',
    start_url: `/${app}?fuente=app`,
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0E1013',
    theme_color: '#0E1013',
    categories: ['business', 'productivity'],
    prefer_related_applications: false,
    icons: [
      { src: `${base}/192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${base}/512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `${base}/maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

// ---------- Dibujo del ícono ----------
type RGB = [number, number, number];
function hex(c: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  const v = m ? parseInt(m[1], 16) : 0x0e1013;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
const lum = ([r, g, b]: RGB) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

// Letras geométricas por trazos (unidades: alto 10). P = polilínea, A = arco elíptico [cx, cy, rx, ry, grados inicio, fin].
type Stroke = ['P', number[]] | ['A', number, number, number, number, number, number];
const L = (...pts: number[]): Stroke => ['P', pts];
const A = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number): Stroke => ['A', cx, cy, rx, ry, a0, a1];
const GLYPHS: Record<string, Stroke[]> = {
  A: [L(0, 10, 3, 0, 6, 10), L(1.2, 6.6, 4.8, 6.6)],
  B: [L(3.5, 0, 0, 0, 0, 10, 4, 10), A(3.5, 2.5, 2.5, 2.5, 270, 450), L(0, 5, 4, 5), A(4, 7.5, 2.5, 2.5, 270, 450)],
  C: [A(3.6, 5, 3.6, 5, 40, 320)],
  D: [L(2.5, 0, 0, 0, 0, 10, 2.5, 10), A(2.5, 5, 3.5, 5, 270, 450)],
  E: [L(6, 0, 0, 0, 0, 10, 6, 10), L(0, 5, 4.6, 5)],
  F: [L(6, 0, 0, 0, 0, 10), L(0, 5, 4.6, 5)],
  G: [A(3.6, 5, 3.6, 5, 0, 320), L(7.2, 5, 4, 5)],
  H: [L(0, 0, 0, 10), L(6, 0, 6, 10), L(0, 5, 6, 5)],
  I: [L(3, 0, 3, 10), L(1, 0, 5, 0), L(1, 10, 5, 10)],
  J: [L(6, 0, 6, 7), A(3, 7, 3, 3, 0, 180)],
  K: [L(0, 0, 0, 10), L(6, 0, 0, 6.2), L(2.2, 4.4, 6, 10)],
  L: [L(0, 0, 0, 10, 6, 10)],
  M: [L(0, 10, 0, 0, 3.5, 6.5, 7, 0, 7, 10)],
  N: [L(0, 10, 0, 0, 6, 10, 6, 0)],
  O: [A(3.6, 5, 3.6, 5, 0, 360)],
  P: [L(0, 10, 0, 0, 3.4, 0), A(3.4, 2.75, 2.75, 2.75, 270, 450), L(3.4, 5.5, 0, 5.5)],
  Q: [A(3.6, 5, 3.6, 5, 0, 360), L(4.6, 7.2, 7.2, 10.4)],
  R: [L(0, 10, 0, 0, 3.4, 0), A(3.4, 2.75, 2.75, 2.75, 270, 450), L(3.4, 5.5, 0, 5.5), L(3, 5.5, 6.2, 10)],
  S: [A(3.1, 2.6, 3, 2.6, 90, 330), A(3.1, 7.4, 3, 2.6, -90, 150)],
  T: [L(0, 0, 6.4, 0), L(3.2, 0, 3.2, 10)],
  U: [L(0, 0, 0, 7), A(3, 7, 3, 3, 0, 180), L(6, 7, 6, 0)],
  V: [L(0, 0, 3.2, 10, 6.4, 0)],
  W: [L(0, 0, 1.8, 10, 3.6, 3, 5.4, 10, 7.2, 0)],
  X: [L(0, 0, 6, 10), L(6, 0, 0, 10)],
  Y: [L(0, 0, 3.2, 5, 6.4, 0), L(3.2, 5, 3.2, 10)],
  Z: [L(0, 0, 6, 0, 0, 10, 6, 10)],
};

export function initialOf(name: string) {
  const plain = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const ch = plain.match(/[A-Z]/)?.[0];
  return ch && GLYPHS[ch] ? ch : 'V';
}

/** Convierte los trazos en segmentos (los arcos se aproximan con 32 tramos). */
function glyphSegments(ch: string): number[][] {
  const segs: number[][] = [];
  for (const st of GLYPHS[ch]) {
    if (st[0] === 'P') {
      const p = st[1];
      for (let i = 0; i + 3 < p.length; i += 2) segs.push([p[i], p[i + 1], p[i + 2], p[i + 3]]);
    } else {
      const [, cx, cy, rx, ry, a0, a1] = st;
      const n = 32;
      let px = cx + rx * Math.cos((a0 * Math.PI) / 180), py = cy + ry * Math.sin((a0 * Math.PI) / 180);
      for (let i = 1; i <= n; i++) {
        const t = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
        const x = cx + rx * Math.cos(t), y = cy + ry * Math.sin(t);
        segs.push([px, py, x, y]); px = x; py = y;
      }
    }
  }
  return segs;
}

function distToSeg(x: number, y: number, s: number[]) {
  const [x1, y1, x2, y2] = s;
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / l2)) : 0;
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

export function renderIcon(o: { size: number; maskable: boolean; name: string; primary: string; accent: string }): Buffer {
  const S = o.size;
  const bg = hex(o.primary);
  const accent = hex(o.accent);
  // Si el acento casi no contrasta con el fondo, usa crema o tinta.
  const fg: RGB = Math.abs(lum(accent) - lum(bg)) > 0.25 ? accent : lum(bg) < 0.5 ? [247, 241, 230] : [14, 16, 19];
  const segs = glyphSegments(initialOf(o.name));
  const k = o.maskable ? 0.72 : 1; // zona segura para íconos adaptables de Android
  const c = S / 2;
  const radius = S * 0.22; // esquinas del fondo (solo íconos "any")
  const ringR = S * 0.34 * k, ringW = S * 0.035 * k;
  // Escala y centra la letra según su caja real.
  const xs = segs.flatMap((q) => [q[0], q[2]]), ys = segs.flatMap((q) => [q[1], q[3]]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const unit = (S * 0.30 * k) / 10;
  const half = (1.55 * unit) / 2; // grosor del trazo
  const ox = c - ((minX + maxX) / 2) * unit, oy = c - ((minY + maxY) / 2) * unit;
  const bx0 = ox + minX * unit - half - 1, bx1 = ox + maxX * unit + half + 1, by0 = oy + minY * unit - half - 1, by1 = oy + maxY * unit + half + 1;

  const inBg = (x: number, y: number) => {
    if (o.maskable) return true;
    const dx = Math.max(Math.abs(x - c) - (c - radius), 0), dy = Math.max(Math.abs(y - c) - (c - radius), 0);
    return dx * dx + dy * dy <= radius * radius;
  };
  const inFg = (x: number, y: number) => {
    const d = Math.hypot(x - c, y - c);
    if (Math.abs(d - ringR) <= ringW / 2) return true;
    if (x < bx0 || x > bx1 || y < by0 || y > by1) return false;
    const ux = (x - ox) / unit, uy = (y - oy) / unit, hu = half / unit;
    for (const q of segs) if (distToSeg(ux, uy, q) <= hu) return true;
    return false;
  };

  const N = 3; // supermuestreo 3x3 para bordes suaves
  const rowLen = S * 4 + 1;
  const raw = Buffer.alloc(rowLen * S);
  for (let y = 0; y < S; y++) {
    raw[y * rowLen] = 0;
    for (let x = 0; x < S; x++) {
      let a = 0, f = 0;
      for (let sy = 0; sy < N; sy++) for (let sx = 0; sx < N; sx++) {
        const px = x + (sx + 0.5) / N, py = y + (sy + 0.5) / N;
        if (inBg(px, py)) { a++; if (inFg(px, py)) f++; }
      }
      const i = y * rowLen + 1 + x * 4;
      const t = a ? f / a : 0;
      raw[i] = Math.round(bg[0] * (1 - t) + fg[0] * t);
      raw[i + 1] = Math.round(bg[1] * (1 - t) + fg[1] * t);
      raw[i + 2] = Math.round(bg[2] * (1 - t) + fg[2] * t);
      raw[i + 3] = Math.round((a / (N * N)) * 255);
    }
  }
  return encodePng(S, S, raw);
}

// ---------- PNG mínimo (RGBA 8 bits) ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf: Buffer) { let c = 0xffffffff; for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(w: number, h: number, raw: Buffer) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
