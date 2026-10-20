import { app } from "@azure/functions";
import { z } from "zod";
import type { IdentityVerifier } from "../lib/identity";
import { withUser } from "../lib/http";
import { messages } from "../lib/models";
import { Repository } from "../lib/repository";
import { getStore, type DocStore } from "../lib/store";
import { renderWorkHistory } from "../lib/workHistoryPdf";
import { todayInJapan } from "./resume";

const requestSchema = z.object({
  era: z.enum(["western", "japanese"]).default("western"),
  summary: z.string().max(800, messages.tooLong(800)).optional(),
  skills: z.string().max(1500, messages.tooLong(1500)).optional(),
  selfPr: z.string().max(1500, messages.tooLong(1500)).optional(),
});

/** POST /api/work-history — 職務経歴書 en PDF (S12), à partir de l'expérience du profil. */
export function workHistoryHandler(deps: { verifier?: () => IdentityVerifier | null; store?: () => DocStore; now?: () => Date } = {}) {
  return withUser(async (req, user) => {
    const options = requestSchema.parse((await req.json().catch(() => ({}))) ?? {});
    const profile = await new Repository((deps.store ?? getStore)()).getProfile(user.userId);
    if (!profile) return { status: 404, jsonBody: { error: "profile_missing" } };
    if (profile.work.length === 0) return { status: 400, jsonBody: { error: "no_work" } };

    const pdf = await renderWorkHistory(profile, { ...options, date: todayInJapan(deps.now?.()) });
    const filename = `職務経歴書_${profile.nameKanji.replace(/\s+/g, "")}.pdf`;
    return {
      body: pdf,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="shokumu-keirekisho.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    };
  }, deps.verifier);
}

app.http("workHistory", { methods: ["POST"], authLevel: "anonymous", route: "work-history", handler: workHistoryHandler() });
