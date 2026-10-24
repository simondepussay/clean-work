import { createContext, useContext } from "react";

export type AuthState =
  | { status: "disabled" }
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; email: string | null; name: string | null };

/** Ce dont l'app a besoin pour la connexion, indépendamment de MSAL (et facile à simuler dans les tests). */
export interface Auth {
  state: AuthState;
  signIn(): Promise<void>;
  /** Ouvre directement le formulaire de création de compte (facultatif : absent dans les tests et la démo). */
  signUp?(): Promise<void>;
  signOut(): Promise<void>;
  /** Jeton d'accès pour l'API, ou null si l'utilisateur n'est pas connecté. */
  getToken(): Promise<string | null>;
}

export const disabledAuth: Auth = {
  state: { status: "disabled" },
  signIn: async () => {},
  signOut: async () => {},
  getToken: async () => null,
};

export const AuthContext = createContext<Auth>(disabledAuth);

export const useAuth = () => useContext(AuthContext);
