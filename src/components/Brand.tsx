// Variables de color de la marca del negocio (antes calculadas en App.tsx de V0.1).
import React from 'react';

function luminance(hex: string) {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function brandVars(primary: string, accent: string): React.CSSProperties {
  const light = luminance(primary) > 0.4;
  return {
    ['--brand' as string]: primary,
    ['--accent' as string]: accent,
    ['--cream' as string]: light ? '#1E140F' : '#F5ECDF',
    ['--on-brand' as string]: light ? '#1E140F' : '#FBF7F1',
  } as React.CSSProperties;
}

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="py-20 flex flex-col items-center gap-3 text-slate2 text-[13px]" role="status">
      <span className="h-6 w-6 rounded-full border-2 border-line border-t-ink animate-spin" />
      {label}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-[#FECDCA] bg-[#FEF3F2] px-4 py-3 text-[13px] text-[#B42318] flex flex-wrap items-center justify-between gap-2" role="alert">
      <span>{message}</span>
      {onRetry && <button onClick={onRetry} className="underline underline-offset-2">Reintentar</button>}
    </div>
  );
}
