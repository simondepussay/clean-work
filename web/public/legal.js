// Bouton 日本語 / English ; ?lang=en dans l'adresse ouvre directement en anglais (lien depuis l'app).
const root = document.documentElement;
function setLang(lang) {
  root.dataset.lang = lang;
  root.lang = lang;
  document.querySelectorAll(".switch button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.set === lang));
}
document.querySelectorAll(".switch button").forEach((b) => b.addEventListener("click", () => setLang(b.dataset.set)));
const asked = new URLSearchParams(location.search).get("lang");
setLang(asked === "en" ? "en" : "ja");
