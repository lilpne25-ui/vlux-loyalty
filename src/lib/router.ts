// Enrutador mínimo con History API (sin dependencias). El servidor devuelve index.html en todas las rutas del SPA.
import { useEffect, useState } from 'react';

const EVT = 'vlux:navigate';

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  if (opts.replace) history.replaceState(null, '', to);
  else history.pushState(null, '', to);
  window.dispatchEvent(new Event(EVT));
  window.scrollTo({ top: 0 });
}

export function useLocation() {
  const read = () => ({ path: location.pathname, search: new URLSearchParams(location.search) });
  const [loc, setLoc] = useState(read);
  useEffect(() => {
    const on = () => setLoc(read());
    window.addEventListener('popstate', on);
    window.addEventListener(EVT, on);
    return () => {
      window.removeEventListener('popstate', on);
      window.removeEventListener(EVT, on);
    };
  }, []);
  return loc;
}
