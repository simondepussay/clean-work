import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import identity from "./auth/identity.json";
import { MsalAuthProvider, type IdentityConfig } from "./auth/MsalAuthProvider.tsx";

const app = <App />;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {identity.configured ? <MsalAuthProvider config={identity as IdentityConfig}>{app}</MsalAuthProvider> : app}
  </StrictMode>,
);
