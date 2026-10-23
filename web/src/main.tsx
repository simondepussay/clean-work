import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { AuthContext } from "./auth/auth";
import identity from "./auth/identity.json";
import { MsalAuthProvider, type IdentityConfig } from "./auth/MsalAuthProvider.tsx";

const root = createRoot(document.getElementById("root")!);

// Mode démo (développement seulement) : faux compte et données d'exemple, voir src/dev/demo.ts.
// `import.meta.env.DEV` vaut false au build : ce bloc et demo.ts disparaissent du site en production.
if (import.meta.env.DEV && new URLSearchParams(location.search).has("demo")) {
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
