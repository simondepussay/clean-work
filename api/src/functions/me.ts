import { app } from "@azure/functions";
import { withUser } from "../lib/http";
import { Repository } from "../lib/repository";
import { getStore } from "../lib/store";

/**
 * GET /api/me — qui est connecté, et a-t-il déjà un profil ?
 * L'app s'en sert après la connexion pour savoir s'il faut proposer de remplir le profil.
 */
export const meHandler = withUser(async (_req, user) => {
  const profile = await new Repository(getStore()).getProfile(user.userId);
  return { jsonBody: { userId: user.userId, email: user.email ?? null, name: user.name ?? null, hasProfile: profile !== null } };
});

app.http("me", { methods: ["GET"], authLevel: "anonymous", route: "me", handler: meHandler });
