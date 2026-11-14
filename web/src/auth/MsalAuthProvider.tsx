import {
  InteractionRequiredAuthError,
  LogLevel,
  PublicClientApplication,
  type AccountInfo,
} from "@azure/msal-browser";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AuthContext, type Auth, type AuthState } from "./auth";
import { clearApiCache } from "../api";

export type IdentityConfig = {
  configured: true;
  tenantId: string;
  tenantSubdomain: string;
  webClientId: string;
  apiScope: string;
};

/** Connexion avec l'annuaire External ID, par redirection (plus fiable que les popups sur mobile). */
export function MsalAuthProvider({ config, children }: { config: IdentityConfig; children: ReactNode }) {
  const pca = useMemo(
    () =>
      new PublicClientApplication({
        auth: {
          clientId: config.webClientId,
          authority: `https://${config.tenantSubdomain}.ciamlogin.com/`,
          redirectUri: `${window.location.origin}/`,
          postLogoutRedirectUri: `${window.location.origin}/`,
        },
        // localStorage : la session survit à la fermeture de l'onglet. La Content-Security-Policy
        // (staticwebapp.config.json, script-src 'self') empêche un script étranger de venir l'y lire.
        cache: { cacheLocation: "localStorage" },
        // Diagnostic de la connexion : avertissements et erreurs de MSAL dans la console, jamais de données personnelles.
        system: {
          loggerOptions: {
            logLevel: LogLevel.Warning,
            piiLoggingEnabled: false,
            loggerCallback: (level, message) => { if (level <= LogLevel.Warning) console.warn("[Clean Work · MSAL]", message); },
          },
        },
      }),
    [config],
  );
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    (async () => {
      await pca.initialize();
      const returning = /[#&](code|error)=/.test(window.location.hash);
      const result = await pca.handleRedirectPromise();
      const current = result?.account ?? pca.getAllAccounts()[0] ?? null;
      // Sans contenu personnel : seulement les étapes, pour comprendre une boucle de connexion.
      console.info("[Clean Work] connexion :", { retourDeMicrosoft: returning, reponseTraitee: !!result, compteEnCache: pca.getAllAccounts().length, connecte: !!current });
      if (current) pca.setActiveAccount(current);
      setAccount(current);
      setReady(true);
    })().catch((e) => {
      // Retour de la page de connexion avec une erreur : on la garde pour l'afficher, au lieu de
      // remontrer la page d'accueil sans explication.
      console.error("connexion : initialisation impossible", e);
      setError((e as { errorCode?: string })?.errorCode ?? "unknown");
      setReady(true);
    });
  }, [pca]);

  const scopes = [config.apiScope];

  const state: AuthState = !ready
    ? { status: "loading" }
    : account
      ? { status: "signedIn", email: account.username || null, name: account.name ?? null }
      : { status: "signedOut", error };

  const auth: Auth = {
    state,
    // prompt « login » : la page demande toujours l'e-mail et le mot de passe, même si la session
    // de l'annuaire est encore ouverte (ordinateur partagé, changement de compte).
    signIn: () => pca.loginRedirect({ scopes, prompt: "login" }),
    // prompt « create » : External ID ouvre directement l'inscription au lieu de la connexion.
    signUp: () => pca.loginRedirect({ scopes, prompt: "create" }),
    // Déconnexion dans l'app seulement : on efface les jetons de ce navigateur et on revient tout de suite
    // à la page d'accueil (connexion / création de compte), sans passer par la page « Choisir un compte »
    // de l'annuaire.
    signOut: async () => {
      await pca.clearCache({ account: account ?? undefined });
      clearApiCache();
      window.history.replaceState(null, "", "/");
      setAccount(null);
    },
    getToken: async () => {
      if (!account) return null;
      try {
        return (await pca.acquireTokenSilent({ scopes, account })).accessToken;
      } catch (e) {
        // Session impossible à renouveler (expirée, ou compte supprimé entre-temps) : on oublie ce compte
        // dans ce navigateur et on revient à l'accueil avec un message. Avant, on renvoyait vers Microsoft,
        // qui pouvait refuser à nouveau : une boucle de connexion sans fin.
        if (e instanceof InteractionRequiredAuthError) {
          await pca.clearCache({ account }).catch(() => {});
          clearApiCache();
          setError("session_expired");
          setAccount(null);
        }
        return null;
      }
    },
  };

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}
