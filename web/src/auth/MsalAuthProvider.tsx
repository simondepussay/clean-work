import {
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo,
} from "@azure/msal-browser";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AuthContext, type Auth, type AuthState } from "./auth";

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
        cache: { cacheLocation: "localStorage" },
      }),
    [config],
  );
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      await pca.initialize();
      const result = await pca.handleRedirectPromise();
      const current = result?.account ?? pca.getAllAccounts()[0] ?? null;
      if (current) pca.setActiveAccount(current);
      setAccount(current);
      setReady(true);
    })().catch((e) => {
      console.error("connexion : initialisation impossible", e);
      setReady(true);
    });
  }, [pca]);

  const scopes = [config.apiScope];

  const state: AuthState = !ready
    ? { status: "loading" }
    : account
      ? { status: "signedIn", email: account.username || null, name: account.name ?? null }
      : { status: "signedOut" };

  const auth: Auth = {
    state,
    signIn: () => pca.loginRedirect({ scopes }),
    signOut: () => pca.logoutRedirect({ account: account ?? undefined }),
    getToken: async () => {
      if (!account) return null;
      try {
        return (await pca.acquireTokenSilent({ scopes, account })).accessToken;
      } catch (e) {
        if (e instanceof InteractionRequiredAuthError) await pca.acquireTokenRedirect({ scopes, account });
        return null;
      }
    },
  };

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}
