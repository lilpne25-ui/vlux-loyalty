// Generación (qrcode-generator) y lectura desde foto (jsQR). Todo local, sin servicios externos.
import qrcode from 'qrcode-generator';
import jsQR from 'jsqr';

export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const rows: boolean[][] = [];
  for (let r = 0; r < n; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < n; c++) row.push(qr.isDark(r, c));
    rows.push(row);
  }
  return rows;
}

export function qrPath(m: boolean[][]): string {
  let d = '';
  m.forEach((row, y) => row.forEach((dark, x) => { if (dark) d += `M${x} ${y}h1v1h-1z`; }));
  return d;
}

export async function decodeQrFromFile(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    // Varias escalas: fotos grandes de celular y capturas pequeñas.
    for (const max of [1200, 800, 500]) {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h);
      const res = jsQR(data.data, w, h, { inversionAttempts: 'attemptBoth' });
      if (res?.data) return res.data;
    }
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------- Cámara en vivo ----------
// Usa BarcodeDetector nativo cuando existe (Chrome/Android) y jsQR como respaldo (iOS Safari).
// Requiere HTTPS (o localhost) y permiso de cámara.
type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

export function cameraSupported() {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

export async function startCameraScanner(video: HTMLVideoElement, onResult: (text: string) => void): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
  video.srcObject = stream;
  video.setAttribute('playsinline', 'true');
  video.muted = true;
  await video.play();

  const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
  let detector: Detector | null = null;
  if (BD) {
    try {
      detector = new BD({ formats: ['qr_code'] });
    } catch {
      detector = null;
    }
  }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  let stopped = false;
  let timer = 0;

  const tick = async () => {
    if (stopped) return;
    try {
      if (video.readyState >= 2 && video.videoWidth) {
        let text: string | null = null;
        if (detector) {
          const found = await detector.detect(video);
          text = found[0]?.rawValue ?? null;
        } else {
          const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          text = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
        }
        if (text && !stopped) {
          onResult(text);
          return;
        }
      }
    } catch (e) {
      // Un cuadro ilegible no detiene el escaneo; se reintenta en el siguiente.
      console.debug('qr frame', e);
    }
    timer = window.setTimeout(tick, 120);
  };
  tick();

  return () => {
    stopped = true;
    clearTimeout(timer);
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };
}

/** Dibuja el QR en un canvas y lo descarga como PNG (con zona de silencio y tamaño de impresión). */
export function downloadQrPng(text: string, filename: string, px = 1024) {
  const m = qrMatrix(text);
  const quiet = 4;
  const cells = m.length + quiet * 2;
  const cell = Math.max(1, Math.floor(px / cells));
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = cell * cells;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0E1013';
  m.forEach((row, y) => row.forEach((on, x) => { if (on) ctx.fillRect((x + quiet) * cell, (y + quiet) * cell, cell, cell); }));
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/png');
}
