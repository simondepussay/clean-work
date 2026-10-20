import { app } from "@azure/functions";
import { z } from "zod";
import type { IdentityVerifier } from "../lib/identity";
import { withUser } from "../lib/http";
import { messages } from "../lib/models";
import { Repository } from "../lib/repository";
import { renderResume } from "../lib/resumePdf";
import { getStore, type DocStore } from "../lib/store";

const requestSchema = z.object({
  era: z.enum(["western", "japanese"]).default("western"),
  appeal: z.string().max(1500, messages.tooLong(1500)).optional(),
  wishes: z.string().max(500, messages.tooLong(500)).optional(),
});

/** Date du jour au Japon (AAAA-MM-JJ) : c'est elle qui figure sur le 履歴書, quel que soit le serveur. */
export const todayInJapan = (now = new Date()) => now.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

/** POST /api/resume — 履歴書 en PDF (S11) à partir du profil. */
export function resumeHandler(deps: { verifier?: () => IdentityVerifier | null; store?: () => DocStore; now?: () => Date } = {}) {
  return withUser(async (req, user) => {
    const options = requestSchema.parse((await req.json().catch(() => ({}))) ?? {});
    const profile = await new Repository((deps.store ?? getStore)()).getProfile(user.userId);
    if (!profile) return { status: 404, jsonBody: { error: "profile_missing" } };

    const pdf = await renderResume(profile, { ...options, date: todayInJapan(deps.now?.()) });
    const filename = `履歴書_${profile.nameKanji.replace(/\s+/g, "")}.pdf`;
    return {
      body: pdf,
      headers: {
        "Content-Type": "application/pdf",
        // Nom ASCII pour les vieux navigateurs, nom japonais (RFC 5987) pour les autres.
        "Content-Disposition": `attachment; filename="rirekisho.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    };
  }, deps.verifier);
}

app.http("resume", { methods: ["POST"], authLevel: "anonymous", route: "resume", handler: resumeHandler() });
