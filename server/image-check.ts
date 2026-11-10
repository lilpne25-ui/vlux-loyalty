// Comprobación de imágenes (logotipos) en el servidor.
/** Comprueba que los bytes decodificados correspondan al tipo declarado (no basta el prefijo data: del navegador). */
export function logoBytesMatch(dataUrl: string): boolean {
  const m = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(dataUrl);
  if (!m) return false;
  const b = Buffer.from(m[2], 'base64');
  if (b.length < 32) return false;
  if (m[1] === 'png') return b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (m[1] === 'jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  return b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP';
}
