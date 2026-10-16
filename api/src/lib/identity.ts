/**
 * Identité de l'utilisateur (S02).
 *
 * L'app (web ou iOS) obtient un jeton d'accès auprès de l'annuaire External ID
 * et l'envoie dans l'en-tête `x-shukatsu-token`. Static Web Apps se sert de
 * l'en-tête `Authorization` pour sa propre authentification : on ne l'utilise pas.
 *
 * Rien n'est cru sur parole : la signature est vérifiée avec les clés publiques
 * de l'annuaire, l'émetteur et le destinataire doivent correspondre exactement,
 * le jeton ne doit pas être expiré et doit porter la permission `access`.
 */
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export const TOKEN_HEADER = "x-shukatsu-token";
export const REQUIRED_SCOPE = "access";

export interface SignedInUser {
  /** Identifiant stable du compte (claim `oid`), utilisé comme userId et clé de partition. */
  userId: string;
  email?: string;
  name?: string;
}

export interface IdentityVerifier {
  verify(token: string | null): Promise<SignedInUser | null>;
}

export class EntraVerifier implements IdentityVerifier {
  readonly issuer: string;

  constructor(
    tenantId: string,
    private readonly audience: string,
    private readonly keys: JWTVerifyGetKey = createRemoteJWKSet(
      new URL(`https://${tenantId}.ciamlogin.com/${tenantId}/discovery/v2.0/keys`),
    ),
  ) {
    this.issuer = `https://${tenantId}.ciamlogin.com/${tenantId}/v2.0`;
  }

  async verify(token: string | null): Promise<SignedInUser | null> {
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, this.keys, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ["RS256"],
      });
      const scopes = typeof payload.scp === "string" ? payload.scp.split(" ") : [];
      if (!scopes.includes(REQUIRED_SCOPE)) return null;
      // `oid` ne change jamais, même si l'utilisateur change d'adresse email.
      if (typeof payload.oid !== "string" || !payload.oid) return null;
      return {
        userId: payload.oid,
        email: typeof payload.email === "string" ? payload.email : undefined,
        name: typeof payload.name === "string" ? payload.name : undefined,
      };
    } catch {
      // Signature, expiration, émetteur ou destinataire : tout échec se vaut.
      return null;
    }
  }
}

/** `null` tant que l'annuaire n'est pas configuré : les routes protégées répondent alors 503. */
export function verifierFromEnv(env: NodeJS.ProcessEnv = process.env): IdentityVerifier | null {
  const { ENTRA_TENANT_ID, ENTRA_API_CLIENT_ID } = env;
  if (!ENTRA_TENANT_ID || !ENTRA_API_CLIENT_ID) return null;
  return new EntraVerifier(ENTRA_TENANT_ID, ENTRA_API_CLIENT_ID);
}
