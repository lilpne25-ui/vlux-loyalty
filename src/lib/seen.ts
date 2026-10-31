// Memoria SOLO de interfaz (no son datos del negocio): qué sellos y premios ya vio el cliente en este
// teléfono, para animar únicamente lo nuevo. Si el navegador no permite guardar, simplemente no anima.
const KEY = 'vlux-loyalty:ui-seen:v2';

function read(): Record<string, string | number> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

function write(m: Record<string, string | number>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    // Sin almacenamiento disponible (modo privado estricto): la animación es opcional.
  }
}

export function getSeen(k: string): number | null {
  const v = read()[k];
  return typeof v === 'number' ? v : null;
}
export function setSeen(k: string, n: number) {
  write({ ...read(), [k]: n });
}
export function getFlag(k: string): string | null {
  const v = read()[k];
  return typeof v === 'string' ? v : null;
}
export function setFlag(k: string, v: string) {
  write({ ...read(), [k]: v });
}
