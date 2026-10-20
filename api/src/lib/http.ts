/**
 * Enveloppe commune des routes protégées : vérifie le jeton, puis appelle le
 * gestionnaire avec l'utilisateur connecté. Les erreurs de validation (zod)
 * deviennent des 400 lisibles, le reste des 500 sans détail interne.
 */
import type { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { ZodError } from "zod";
import { TOKEN_HEADER, verifierFromEnv, type IdentityVerifier, type SignedInUser } from "./identity";

export type AuthedHandler = (req: HttpRequest, user: SignedInUser, ctx: InvocationContext) => Promise<HttpResponseInit>;

let shared: IdentityVerifier | null | undefined;

export function withUser(handler: AuthedHandler, verifier?: () => IdentityVerifier | null) {
  const resolve = verifier ?? (() => (shared ??= verifierFromEnv()));
  return async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    const v = resolve();
    if (!v) return { status: 503, jsonBody: { error: "auth_not_configured" } };

    const user = await v.verify(req.headers.get(TOKEN_HEADER));
    if (!user) return { status: 401, jsonBody: { error: "unauthorized" } };

    try {
      return await handler(req, user, ctx);
    } catch (e) {
      if (e instanceof ZodError) {
        return { status: 400, jsonBody: { error: "invalid", issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } };
      }
      ctx.error("erreur inattendue", e);
      return { status: 500, jsonBody: { error: "internal" } };
    }
  };
}
