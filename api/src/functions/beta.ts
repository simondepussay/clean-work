import { app, type HttpRequest, type InvocationContext } from "@azure/functions";
import { timingSafeEqual } from "node:crypto";
import { ZodError } from "zod";
import { addSignup, takeNewSignups } from "../lib/beta";
import { getStore, type DocStore } from "../lib/store";
import { CRON_HEADER } from "./pushRun";

type Deps = { store?: () => DocStore; secret?: () => string | undefined; now?: () => Date };

function sameSecret(given: string | null, expected: string | undefined) {
  if (!given || !expected || expected.length < 32) return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Adresse de la connexion (pour limiter les envois répétés) : Static Web Apps la transmet dans ces en-têtes. */
const clientIp = (req: HttpRequest) =>
  req.headers.get("x-azure-clientip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null;

/**
 * POST /api/beta { email, device, message?, lang, consent, website } — demande de participation à la bêta,
 * sans compte. 201 : enregistrée ; 200 « already » : déjà reçue ; 429 : trop de demandes.
 */
export function betaSignupHandler(deps: Deps = {}) {
  return async (req: HttpRequest, ctx: InvocationContext) => {
    try {
      const result = await addSignup((deps.store ?? getStore)(), await req.json().catch(() => null), clientIp(req), (deps.now ?? (() => new Date()))());
      if (result === "limited") return { status: 429, jsonBody: { error: "limit" } };
      if (result === "duplicate") return { status: 200, jsonBody: { status: "already" } };
      // « ignored » (robot) répond comme un succès : rien ne lui indique qu'il a été repéré.
      return { status: 201, jsonBody: { status: "ok" } };
    } catch (e) {
      if (e instanceof ZodError) {
        return { status: 400, jsonBody: { error: "invalid", issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } };
      }
      ctx.error("bêta : demande impossible à enregistrer", e);
      return { status: 500, jsonBody: { error: "server" } };
    }
  };
}

/** POST /api/beta/run — nouvelles demandes pour l'e-mail du matin (tâche planifiée, secret x-shukatsu-cron). */
export function betaDigestHandler(deps: Deps = {}) {
  return async (req: HttpRequest) => {
    if (!sameSecret(req.headers.get(CRON_HEADER), (deps.secret ?? (() => process.env.PUSH_CRON_SECRET))())) {
      return { status: 401, jsonBody: { error: "unauthorized" } };
    }
    return { jsonBody: { signups: await takeNewSignups((deps.store ?? getStore)()) } };
  };
}

app.http("betaSignup", { methods: ["POST"], authLevel: "anonymous", route: "beta", handler: betaSignupHandler() });
app.http("betaDigest", { methods: ["POST"], authLevel: "anonymous", route: "beta/run", handler: betaDigestHandler() });
