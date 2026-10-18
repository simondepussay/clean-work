/**
 * Suppression du compte dans l'annuaire External ID (S25).
 *
 * Effacer les données ne suffit pas : Apple exige que « supprimer mon compte »
 * supprime aussi le compte lui-même. L'API s'authentifie pour cela auprès de
 * l'annuaire avec sa propre identité d'application (repris de Kanji Otter).
 *
 * Une identité managée aurait évité ce secret, mais les fonctions intégrées à
 * Static Web Apps n'en ont pas, et l'annuaire n'est pas dans le même tenant que
 * l'abonnement Azure.
 */
export interface DirectoryUsers {
  /** Supprime l'utilisateur ; ne fait rien s'il n'existe déjà plus. */
  deleteUser(userId: string): Promise<void>;
}

export class GraphDirectoryUsers implements DirectoryUsers {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly tenantId: string,
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async deleteUser(userId: string): Promise<void> {
    const response = await this.fetcher(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${await this.accessToken()}` },
    });
    // 404 : déjà supprimé, par exemple si une première tentative a échoué après coup.
    if (!response.ok && response.status !== 404) {
      throw new Error(`Suppression annuaire ${response.status} ${(await response.text()).slice(0, 200)}`);
    }
  }

  /** Jeton d'application, gardé en mémoire jusqu'à une minute avant sa fin. */
  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value;
    const response = await this.fetcher(`https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    });
    if (!response.ok) throw new Error(`Jeton d'annuaire refusé : ${response.status}`);
    const body = (await response.json()) as { access_token: string; expires_in: number };
    this.token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in - 60) * 1000 };
    return this.token.value;
  }
}

/** `null` tant que l'application de suppression n'est pas configurée. */
export function directoryFromEnv(env: NodeJS.ProcessEnv = process.env): DirectoryUsers | null {
  const { ENTRA_TENANT_ID, ENTRA_GRAPH_CLIENT_ID, ENTRA_GRAPH_SECRET } = env;
  if (!ENTRA_TENANT_ID || !ENTRA_GRAPH_CLIENT_ID || !ENTRA_GRAPH_SECRET) return null;
  return new GraphDirectoryUsers(ENTRA_TENANT_ID, ENTRA_GRAPH_CLIENT_ID, ENTRA_GRAPH_SECRET);
}
