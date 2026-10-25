/**
 * Après une mise en ligne, les fichiers des onglets changent de nom (cache d'un an par fichier).
 * Une page ouverte avant la mise en ligne cherche alors un fichier qui n'existe plus : écran blanc.
 * Vite signale ce cas (« vite:preloadError ») : on recharge la page une fois pour prendre la nouvelle version.
 * La marque en sessionStorage évite une boucle si le fichier manque vraiment.
 */
const KEY = "clean-work:reloaded-for-new-version";

export function reloadOnce(): boolean {
  try {
    if (sessionStorage.getItem(KEY)) return false;
    sessionStorage.setItem(KEY, "1");
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/** Un onglet s'est chargé normalement : la prochaine mise en ligne pourra de nouveau recharger la page. */
export function loadedFine() {
  try { sessionStorage.removeItem(KEY); } catch { /* stockage indisponible : rien à faire */ }
}

export function installReloadOnNewVersion() {
  window.addEventListener("vite:preloadError", (event) => {
    if (reloadOnce()) event.preventDefault();
  });
}
