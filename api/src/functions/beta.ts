import { app, type HttpRequest, type InvocationContext } from "@azure/functions";
import { ZodError } from "zod";
import { addSignup, takeNewSignups } from "../lib/beta";
import { getStore, type DocStore } from "../lib/store";
import { cronSecretFromEnv, invalid, tooLarge, withCron } from "../lib/http";

type Deps = { store?: () => DocStore; secret?: () => string | undefined; now?: () => Date };


/**
 * Adresse de la connexion (pour limiter les envois répétés). L'app appelle l'API directement : le seul
 * élément fiable est le dernier de X-Forwarded-For, ajouté par Azure lui-même. Tout ce qui le précède
 * (et un en-tête comme x-azure-clientip) est écrit par l'expéditeur, qui pourrait changer de fausse
 * adresse à chaque envoi pour contourner la limite.
 */
export function clientIp(req: HttpRequest): string | null {
  const last = req.headers.get("x-forwarded-for")?.split(",").pop()?.trim();
  if (!last) return null;
  // Azure ajoute le port : « 203.0.113.7:51234 » ou « [2001:db8::1]:51234 ».
  const v6 = /^\[([^\]]+)\](?::\d+)?$/.exec(last);
  if (v6) return v6[1];
  return /^[\d.]+:\d+$/.test(last) ? last.slice(0, last.lastIndexOf(":")) : last;
}

/**
 * POST /api/beta { email, device, message?, lang, consent, website } — demande de participation à la bêta,
 * sans compte. 201 : enregistrée ; 200 « already » : déjà reçue ; 429 : trop de demandes.
 */
export function betaSignupHandler(deps: Deps = {}) {
  return async (req: HttpRequest, ctx: InvocationContext) => {
    const big = tooLarge(req, 8 * 1024);
    if (big) return big;
    try {
      const result = await addSignup((deps.store ?? getStore)(), await req.json().catch(() => null), clientIp(req), (deps.now ?? (() => new Date()))());
      if (result === "limited") return { status: 429, jsonBody: { error: "limit" } };
      if (result === "duplicate") return { status: 200, jsonBody: { status: "already" } };
      // « ignored » (robot) répond comme un succès : rien ne lui indique qu'il a été repéré.
      return { status: 201, jsonBody: { status: "ok" } };
    } catch (e) {
      if (e instanceof ZodError) return invalid(e);
      ctx.error("bêta : demande impossible à enregistrer", e);
      return { status: 500, jsonBody: { error: "server" } };
    }
  };
}

/** POST /api/beta/run — nouvelles demandes pour l'e-mail du matin (tâche planifiée, secret x-shukatsu-cron). */
export function betaDigestHandler(deps: Deps = {}) {
  return withCron(deps.secret ?? (() => cronSecretFromEnv("BETA")), async () => ({
    jsonBody: { signups: await takeNewSignups((deps.store ?? getStore)()) },
  }));
}

app.http("betaSignup", { methods: ["POST"], authLevel: "anonymous", route: "beta", handler: betaSignupHandler() });
app.http("betaDigest", { methods: ["POST"], authLevel: "anonymous", route: "beta/run", handler: betaDigestHandler() });
