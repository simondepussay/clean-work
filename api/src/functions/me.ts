import { app, type HttpRequest, type InvocationContext } from "@azure/functions";
import { deleteAccount, DirectoryUnavailableError } from "../lib/account";
import { directoryFromEnv, type DirectoryUsers } from "../lib/directory";
import type { IdentityVerifier } from "../lib/identity";
import { withUser } from "../lib/http";
import { Repository } from "../lib/repository";
import { getStore, type DocStore } from "../lib/store";

/**
 * GET /api/me — qui est connecté, et a-t-il déjà un profil ?
 * L'app s'en sert après la connexion pour savoir s'il faut proposer de remplir le profil.
 *
 * DELETE /api/me — supprime le compte et toutes ses données (S25, exigé par l'App Store).
 */
export function meHandler(deps: { verifier?: () => IdentityVerifier | null; store?: () => DocStore; directory?: () => DirectoryUsers | null } = {}) {
  const store = deps.store ?? getStore;
  const getMe = withUser(async (_req, user) => {
    const profile = await new Repository(store()).getProfile(user.userId);
    return { jsonBody: { userId: user.userId, email: user.email ?? null, name: user.name ?? null, hasProfile: profile !== null } };
  }, deps.verifier);

  const deleteMe = withUser(async (_req, user, ctx) => {
    try {
      const { documents } = await deleteAccount(user.userId, new Repository(store()), (deps.directory ?? directoryFromEnv)());
      ctx.log(`compte supprimé : ${documents} document(s)`);
      return { status: 204 };
    } catch (e) {
      if (e instanceof DirectoryUnavailableError) return { status: 503, jsonBody: { error: "deletion_not_configured" } };
      throw e;
    }
  }, deps.verifier);

  return (req: HttpRequest, ctx: InvocationContext) => (req.method === "DELETE" ? deleteMe(req, ctx) : getMe(req, ctx));
}

app.http("me", { methods: ["GET", "DELETE"], authLevel: "anonymous", route: "me", handler: meHandler() });
