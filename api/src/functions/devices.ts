import { app } from "@azure/functions";
import type { IdentityVerifier } from "../lib/identity";
import { withUser } from "../lib/http";
import { getPushSender, type PushSender } from "../lib/push";
import { Repository } from "../lib/repository";
import { getStore, type DocStore } from "../lib/store";

/**
 * iPhone qui reçoivent les rappels (S26) :
 *   POST   /api/devices           { token, environment } → { push: "on" | "off" }
 *   DELETE /api/devices/{token}   à la déconnexion → 204 (même si le jeton était inconnu)
 *
 * « push: off » veut dire que le serveur n'enverra rien (APNs pas configuré) :
 * l'app garde alors ses rappels locaux.
 */
export function devicesHandler(deps: { verifier?: () => IdentityVerifier | null; store?: () => DocStore; push?: () => PushSender | null; now?: () => Date } = {}) {
  return withUser(async (req, user) => {
    const repo = new Repository((deps.store ?? getStore)(), deps.now);
    const token = req.params.token;

    if (req.method === "POST" && !token) {
      await repo.registerDevice(user.userId, await req.json().catch(() => null));
      return { jsonBody: { push: (deps.push ?? getPushSender)() ? "on" : "off" } };
    }
    if (req.method === "DELETE" && token) {
      await repo.removeDevice(user.userId, token);
      return { status: 204 };
    }
    return { status: 404, jsonBody: { error: "not_found" } };
  }, deps.verifier);
}

app.http("devices", { methods: ["POST", "DELETE"], authLevel: "anonymous", route: "devices/{token?}", handler: devicesHandler() });
