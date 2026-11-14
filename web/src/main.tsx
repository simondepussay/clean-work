import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { installReloadOnNewVersion } from "./reloadOnNewVersion";

installReloadOnNewVersion();
import { AuthContext } from "./auth/auth";
import identity from "./auth/identity.json";
import { MsalAuthProvider, type IdentityConfig } from "./auth/MsalAuthProvider.tsx";

const root = createRoot(document.getElementById("root")!);

// MSAL 5 : le renouvellement silencieux de la session (quand le jeton de rafraîchissement a expiré) charge
// la page dans un iframe caché ; c'est à cette page de renvoyer la réponse de l'annuaire à la fenêtre
// principale. Dans ce cas on ne lance pas l'application.
const silentRenewal = window.parent !== window && /[#&?]state=/.test(location.hash + location.search);

if (silentRenewal) {
  import("@azure/msal-browser/redirect-bridge").then(({ broadcastResponseToMainFrame }) =>
    broadcastResponseToMainFrame().catch((e) => console.warn("[Clean Work] renouvellement silencieux :", e)),
  );
} else if (
  // Mode démo (développement seulement) : faux compte et données d'exemple, voir src/dev/demo.ts.
  // `import.meta.env.DEV` vaut false au build : ce bloc et demo.ts disparaissent du site en production.
  import.meta.env.DEV && new URLSearchParams(location.search).has("demo")
) {
  import("./dev/demo").then(({ demoAuth, installDemoApi }) => {
    installDemoApi();
    root.render(<StrictMode><AuthContext.Provider value={demoAuth}><App /></AuthContext.Provider></StrictMode>);
  });
} else {
  const app = <App />;
  root.render(
    <StrictMode>
      {identity.configured ? <MsalAuthProvider config={identity as IdentityConfig}>{app}</MsalAuthProvider> : app}
    </StrictMode>,
  );
}
