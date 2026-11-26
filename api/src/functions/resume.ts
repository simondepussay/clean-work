import { app } from "@azure/functions";
import { z } from "zod";
import type { IdentityVerifier } from "../lib/identity";
import { withUser } from "../lib/http";
import { messages } from "../lib/models";
import { Repository } from "../lib/repository";
import { renderResumeChecked, WEEKDAYS } from "../lib/resumePdf";
import { award } from "../lib/score";
import { getStore, type DocStore } from "../lib/store";

const requestSchema = z.object({
  era: z.enum(["western", "japanese"]).default("western"),
  // standard par défaut : l'app iPhone, qui n'envoie pas ce champ, garde le modèle du 厚生労働省.
  template: z.enum(["standard", "student", "baito"]).default("standard"),
  appeal: z.string().max(1500, messages.tooLong(1500)).optional(),
  wishes: z.string().max(500, messages.tooLong(500)).optional(),
  gakuchika: z.string().max(1500, messages.tooLong(1500)).optional(),
  selfPr: z.string().max(1500, messages.tooLong(1500)).optional(),
  days: z.array(z.enum(WEEKDAYS)).max(7).optional(),
  hours: z.string().max(200, messages.tooLong(200)).optional(),
  station: z.string().max(40, messages.tooLong(40)).optional(),
  commute: z.number().int().min(1).max(300).optional(),
});

/** Date du jour au Japon (AAAA-MM-JJ) : c'est elle qui figure sur le 履歴書, quel que soit le serveur. */
export const todayInJapan = (now = new Date()) => now.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

/** POST /api/resume — 履歴書 en PDF (S11) à partir du profil ; modèle standard, 新卒用 ou アルバイト用. */
export function resumeHandler(deps: { verifier?: () => IdentityVerifier | null; store?: () => DocStore; now?: () => Date } = {}) {
  return withUser(async (req, user) => {
    const options = requestSchema.parse((await req.json().catch(() => ({}))) ?? {});
    const store = (deps.store ?? getStore)();
    const profile = await new Repository(store).getProfile(user.userId);
    if (!profile) return { status: 404, jsonBody: { error: "profile_missing" } };

    const { pdf, cut } = await renderResumeChecked(profile, { ...options, date: todayInJapan(deps.now?.()) });
    const filename = `履歴書_${profile.nameKanji.replace(/\s+/g, "")}.pdf`;
    await award(store, user.userId, [{ kind: "document", key: `resume_${todayInJapan(deps.now?.())}` }], deps.now);
    return {
      body: pdf,
      headers: {
        "Content-Type": "application/pdf",
        // Nom ASCII pour les vieux navigateurs, nom japonais (RFC 5987) pour les autres.
        "Content-Disposition": `attachment; filename="rirekisho.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
        // Rubriques coupées faute de place (ex. « history,appeal ») : l'app prévient l'étudiant.
        "X-Resume-Cut": cut.join(","),
        "Access-Control-Expose-Headers": "X-Resume-Cut",
      },
    };
  }, deps.verifier);
}

app.http("resume", { methods: ["POST"], authLevel: "anonymous", route: "resume", handler: resumeHandler() });
