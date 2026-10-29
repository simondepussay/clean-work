/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Adresse de l'API en production (Function App de Séoul) ; vide en local : même site. */
  readonly VITE_API_BASE?: string;
}
