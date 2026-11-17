import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import { AgentKeyService, type AgentIdentity } from "../lib/agentKeys";
import { RateLimiter, tooLarge } from "../lib/http";
import { TOKEN_HEADER } from "../lib/identity";
import { handleMcp } from "../lib/mcp";
import { getStore, type DocStore } from "../lib/store";

/** Par minute et par compte : un agent qui boucle ne fait pas exploser la base. */
const calls = new RateLimiter(60);

/**
 * Serveur MCP (transport Streamable HTTP, sans session) pour l'agent IA de l'utilisateur :
 *   POST /api/mcp            clé dans « Authorization: Bearer cwk_… » (ou x-shukatsu-token)
 *   POST /api/mcp/{cwk_…}    clé dans l'adresse, pour les clients qui ne savent pas ajouter d'en-tête
 * Réponses en JSON (pas de flux SSE) ; GET → 405 (le serveur n'envoie rien de lui-même).
 */
export function mcpHandler(deps: { store?: () => DocStore; now?: () => Date; limiter?: RateLimiter } = {}) {
  return async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (req.method !== "POST") return { status: 405, headers: { Allow: "POST" }, jsonBody: { error: "method_not_allowed" } };
    const big = tooLarge(req, 64 * 1024);
    if (big) return big;

    const store = (deps.store ?? getStore)();
    const now = deps.now ?? (() => new Date());
    const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
    const secret = bearer ?? req.headers.get(TOKEN_HEADER) ?? req.params.key ?? null;
    const agent: AgentIdentity | null = await new AgentKeyService(store, now).verify(secret);
    if (!agent) {
      return { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="clean-work"' }, jsonBody: { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Invalid or revoked Clean Work agent key" } } };
    }
    if (!(deps.limiter ?? calls).take(agent.userId)) return { status: 429, headers: { "retry-after": "60" }, jsonBody: { error: "rate_limited" } };

    const message = await req.json().catch(() => undefined);
    if (message === undefined) return { status: 400, jsonBody: { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } } };
    try {
      const response = await handleMcp(message, { agent, store, now });
      return response ? { jsonBody: response, headers: { "Cache-Control": "no-store" } } : { status: 202 };
    } catch (e) {
      ctx.error("MCP : erreur inattendue", e);
      return { status: 500, jsonBody: { jsonrpc: "2.0", id: (message as { id?: unknown })?.id ?? null, error: { code: -32603, message: "Internal error" } } };
    }
  };
}

app.http("mcp", { methods: ["GET", "POST", "DELETE"], authLevel: "anonymous", route: "mcp/{key?}", handler: mcpHandler() });
