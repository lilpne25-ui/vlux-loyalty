// Prepara el logotipo en el navegador: lo reduce a 256 px como máximo y lo convierte a PNG/WebP
// para que quepa en el límite del servidor (~64 KB). No se sube a ningún servicio externo.
const MAX_SIDE = 256;
const MAX_CHARS = 90_000;
const MAX_PIXELS = 40_000_000; // protege la memoria del navegador (una foto de 8000×5000 ya es el límite)
const DECODE_TIMEOUT_MS = 10_000;

export async function prepareLogo(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Usa una imagen PNG, JPG o WebP.');
  if (file.size > 5 * 1024 * 1024) throw new Error('La imagen pesa más de 5 MB.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => bad(new Error('No se pudo leer la imagen.'));
      setTimeout(() => bad(new Error('La imagen tardó demasiado en leerse.')), DECODE_TIMEOUT_MS);
      i.src = url;
    });
    if (img.naturalWidth * img.naturalHeight > MAX_PIXELS || !img.naturalWidth || !img.naturalHeight) throw new Error('La imagen es demasiado grande en píxeles. Usa una de menos de 40 megapíxeles.');
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const [type, q] of [['image/webp', 0.9], ['image/png', undefined], ['image/webp', 0.7], ['image/jpeg', 0.8]] as const) {
      const out = canvas.toDataURL(type, q);
      if (out.startsWith(`data:${type}`) && out.length <= MAX_CHARS) return out;
    }
    throw new Error('El logotipo sigue siendo demasiado grande. Prueba con una imagen más simple.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
