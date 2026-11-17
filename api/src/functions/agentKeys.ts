import { app } from "@azure/functions";
import { AgentKeyService, MAX_KEYS, TooManyKeysError } from "../lib/agentKeys";
import type { IdentityVerifier } from "../lib/identity";
import { withUser } from "../lib/http";
import { getStore, type DocStore } from "../lib/store";

/**
 * Clés pour agent IA (serveur MCP), gérées depuis la page du compte :
 *   GET    /api/agent-keys        → les clés (nom, portée, création, dernière utilisation ; jamais le secret)
 *   POST   /api/agent-keys        { name, scope: "read"|"write" } → 201 { key (montrée une seule fois), info }
 *   DELETE /api/agent-keys/{id}   révoque la clé → 204
 */
export function agentKeysHandler(deps: { verifier?: () => IdentityVerifier | null; store?: () => DocStore; now?: () => Date } = {}) {
  return withUser(async (req, user) => {
    const keys = new AgentKeyService((deps.store ?? getStore)(), deps.now);
    const id = req.params.id;
    if (!id && req.method === "POST") {
      try {
        return { status: 201, jsonBody: await keys.create(user.userId, await req.json().catch(() => null)), headers: { "Cache-Control": "no-store" } };
      } catch (e) {
        if (e instanceof TooManyKeysError) return { status: 409, jsonBody: { error: "too_many_keys", max: MAX_KEYS } };
        throw e;
      }
    }
    if (!id && req.method === "GET") return { jsonBody: await keys.list(user.userId) };
    if (id && req.method === "DELETE") return (await keys.revoke(user.userId, id)) ? { status: 204 } : { status: 404, jsonBody: { error: "not_found" } };
    return { status: 404, jsonBody: { error: "not_found" } };
  }, deps.verifier);
}

app.http("agentKeys", { methods: ["GET", "POST", "DELETE"], authLevel: "anonymous", route: "agent-keys/{id?}", handler: agentKeysHandler() });
