import { app } from "@azure/functions";
import { deleteAccount, DirectoryUnavailableError } from "../lib/account";
import { directoryFromEnv } from "../lib/directory";
import { withUser } from "../lib/http";
import { Repository } from "../lib/repository";
import { getStore } from "../lib/store";

/**
 * GET /api/me — qui est connecté, et a-t-il déjà un profil ?
 * L'app s'en sert après la connexion pour savoir s'il faut proposer de remplir le profil.
 */
const getMe = withUser(async (_req, user) => {
  const profile = await new Repository(getStore()).getProfile(user.userId);
  return { jsonBody: { userId: user.userId, email: user.email ?? null, name: user.name ?? null, hasProfile: profile !== null } };
});

/** DELETE /api/me — supprime le compte et toutes ses données (S25, exigé par l'App Store). */
const deleteMe = withUser(async (_req, user, ctx) => {
  try {
    const { documents } = await deleteAccount(user.userId, new Repository(getStore()), directoryFromEnv());
    ctx.log(`compte supprimé : ${documents} document(s)`);
    return { status: 204 };
  } catch (e) {
    if (e instanceof DirectoryUnavailableError) return { status: 503, jsonBody: { error: "deletion_not_configured" } };
    throw e;
  }
});

app.http("me", {
  methods: ["GET", "DELETE"],
  authLevel: "anonymous",
  route: "me",
  handler: (req, ctx) => (req.method === "DELETE" ? deleteMe(req, ctx) : getMe(req, ctx)),
});
