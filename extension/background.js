/**
 * « Clean Work に追加 » : un clic sur l'icône (ou Alt+Maj+S) lit l'offre de l'onglet ouvert
 * et ouvre Clean Work avec le formulaire de 応募 déjà rempli.
 *
 * Permissions minimales : « activeTab » ne donne accès qu'à l'onglet où l'on clique, au moment du clic ;
 * « scripting » permet d'y lancer extractJob. L'extension ne garde rien et ne voit jamais le compte.
 */
import { extractJob, jobLink } from "./extract.js";

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !/^https?:/.test(tab.url || "")) return;
  let job = { url: tab.url, position: tab.title };
  try {
    const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractJob });
    if (result?.result) job = result.result;
  } catch {
    // Page protégée (Chrome Web Store, pages internes…) : on garde au moins le lien et le titre.
  }
  await chrome.tabs.create({ url: jobLink(job), index: tab.index + 1 });
});
