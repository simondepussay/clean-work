import { HttpRequest, InvocationContext } from "@azure/functions";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { resumeHandler, todayInJapan } from "../src/functions/resume";
import type { IdentityVerifier } from "../src/lib/identity";
import { Repository } from "../src/lib/repository";
import { MemoryStore } from "../src/lib/store";

const as = (userId: string): IdentityVerifier => ({ verify: async (t) => (t === "ok" ? { userId } : null) });
const ctx = new InvocationContext({ logHandler: () => {} });

async function call(payload: unknown, withProfile = true) {
  const store = new MemoryStore();
  if (withProfile) await new Repository(store).saveProfile("u1", { nameKanji: "デプセ シモン", nameKana: "でぷせ しもん" });
  const req = new HttpRequest({ url: "https://x/api/resume", method: "POST", headers: { "x-shukatsu-token": "ok" }, body: { string: JSON.stringify(payload) } });
  return resumeHandler({ verifier: () => as("u1"), store: () => store })(req, ctx);
}

describe("POST /api/resume", () => {
  it("renvoie un PDF de deux pages, à télécharger sous un nom japonais", async () => {
    const res = await call({ era: "japanese" });
    const pdf = res.body as Uint8Array;
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(2);
    expect(res.headers).toMatchObject({ "Content-Type": "application/pdf" });
    expect((res.headers as Record<string, string>)["Content-Disposition"]).toContain(encodeURIComponent("履歴書_デプセシモン.pdf"));
    expect(pdf.length).toBeLessThan(200_000);
  });

  it("404 sans profil", async () => {
    expect((await call({}, false)).jsonBody).toEqual({ error: "profile_missing" });
  });

  it("400 pour une ère inconnue ou un texte trop long", async () => {
    expect((await call({ era: "heisei" })).status).toBe(400);
    expect((await call({ appeal: "あ".repeat(1501) })).status).toBe(400);
  });

  it("la date est celle du Japon : 23 h UTC le 20 est déjà le 21 à Tokyo", () => {
    expect(todayInJapan(new Date("2026-10-20T23:00:00Z"))).toBe("2026-10-21");
    expect(todayInJapan(new Date("2026-10-20T14:00:00Z"))).toBe("2026-10-20");
  });
});
