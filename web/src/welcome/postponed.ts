/** « あとで » choisi sur cet appareil : l'écran de bienvenue ne revient pas à chaque visite. */
const laterKey = (owner: string | null) => `welcome-later:${owner ?? ""}`;

export function welcomePostponed(owner: string | null): boolean {
  try { return localStorage.getItem(laterKey(owner)) === "1"; } catch { return false; }
}

export function postponeWelcome(owner: string | null) {
  try { localStorage.setItem(laterKey(owner), "1"); } catch { /* stockage indisponible : il reviendra à la prochaine visite */ }
}
