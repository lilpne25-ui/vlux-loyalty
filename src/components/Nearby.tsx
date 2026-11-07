// V0.4.6 · "¿Estoy cerca?" (ubicación en primer plano). Reglas de privacidad:
// - Solo cuando el cliente toca el botón, con la app abierta. Una sola lectura, sin seguimiento continuo.
// - La distancia se calcula EN el teléfono: la ubicación del cliente nunca se envía a VLUX ni al negocio.
// - No se guarda la ubicación ni rutas. La tarjeta funciona igual sin ubicación.
// - Una PWA NO puede detectar en segundo plano que el cliente pasa cerca del negocio (geovalla): eso requiere app nativa.
import React, { useState } from 'react';
import { MapPin, Navigation } from 'lucide-react';
import { Button } from './ui';

export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function describeDistance(m: number) {
  if (m < 150) return 'Estás aquí o muy cerca';
  if (m < 1000) return `Estás a unos ${Math.round(m / 50) * 50} m`;
  if (m < 20000) return `Estás a unos ${(m / 1000).toFixed(1).replace('.0', '')} km`;
  return `Estás a más de ${Math.floor(m / 1000)} km`;
}

type State = { k: 'idle' } | { k: 'busy' } | { k: 'done'; text: string } | { k: 'denied' } | { k: 'error' };

export function NearbyCheck({ businessName, location }: { slug: string; businessName: string; location: { lat: number; lng: number } | null }) {
  const [st, setSt] = useState<State>({ k: 'idle' });
  if (!location) return null;
  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator && window.isSecureContext;
  const check = () => {
    setSt({ k: 'busy' });
    navigator.geolocation.getCurrentPosition(
      (pos) => setSt({ k: 'done', text: `${describeDistance(distanceMeters({ lat: pos.coords.latitude, lng: pos.coords.longitude }, location))} de ${businessName}.` }),
      (err) => setSt(err.code === err.PERMISSION_DENIED ? { k: 'denied' } : { k: 'error' }),
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 },
    );
  };
  const maps = `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}`;
  return (
    <section className="rounded-2xl border border-cafe-line bg-white/70 px-5 py-4 flex flex-col gap-2.5" data-testid="nearby">
      <div className="inline-flex items-center gap-2 text-[13.5px] font-medium text-cafe-ink"><MapPin size={16} /> ¿Estoy cerca?</div>
      {st.k === 'done' && <p className="text-[14px] text-cafe-ink" data-testid="nearby-result">{st.text}</p>}
      {st.k === 'denied' && <p className="text-[13px] text-cafe-body" data-testid="nearby-denied">No diste permiso de ubicación. No pasa nada: tu tarjeta funciona igual. Puedes cambiarlo en los ajustes del navegador.</p>}
      {st.k === 'error' && <p className="text-[13px] text-cafe-body">No pudimos leer tu ubicación ahora. Intenta de nuevo con buena señal.</p>}
      {st.k !== 'done' && st.k !== 'denied' && supported && (
        <>
          <p className="text-[12.5px] text-cafe-muted leading-snug">Si tocas el botón, tu teléfono te pedirá permiso para leer tu ubicación UNA vez. La distancia se calcula en tu teléfono: no la enviamos ni la guardamos.</p>
          <Button variant="secondary" size="sm" onClick={check} disabled={st.k === 'busy'} data-testid="nearby-check"><Navigation size={15} /> {st.k === 'busy' ? 'Calculando…' : 'Calcular distancia'}</Button>
        </>
      )}
      <a href={maps} target="_blank" rel="noopener noreferrer" className="text-[12.5px] text-cafe-muted underline underline-offset-2 self-start">Cómo llegar (Google Maps)</a>
    </section>
  );
}
