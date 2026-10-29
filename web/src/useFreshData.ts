import { useEffect, useRef } from "react";
import { DATA_EVENT } from "./data";

/**
 * Relance `reload` quand des données fraîches arrivent (/api/bootstrap, voir data.ts).
 * L'écran se relit depuis le cache, déjà rempli : pas d'attente, pas de clignotement.
 */
export function useFreshData(reload: () => void) {
  const latest = useRef(reload);
  latest.current = reload;
  useEffect(() => {
    const onData = () => latest.current();
    window.addEventListener(DATA_EVENT, onData);
    return () => window.removeEventListener(DATA_EVENT, onData);
  }, []);
}
