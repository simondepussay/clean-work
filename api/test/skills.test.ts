import { HttpRequest, InvocationContext } from "@azure/functions";
import { describe, expect, it } from "vitest";
import { profileHandler } from "../src/functions/profile";
import { skillsHandler } from "../src/functions/skills";
import type { IdentityVerifier } from "../src/lib/identity";
import { buildContext } from "../src/lib/interview";
import { buildMessages } from "../src/lib/review";
import { skillLines } from "../src/lib/skills";

// Sans COSMOS_ENDPOINT, getStore() renvoie un store en mémoire partagé : chaque test utilise son propre utilisateur.
const as = (userId: string): IdentityVerifier => ({ verify: async (t) => (t === "ok" ? { userId } : null) });
const ctx = new InvocationContext({ logHandler: () => {} });

function call(userId: string, method: "GET" | "PUT", body?: unknown, handler = skillsHandler) {
  const req = new HttpRequest({
    url: "https://x/api/skills",
    method,
    headers: { "x-shukatsu-token": "ok", "content-type": "application/json" },
    body: body === undefined ? undefined : { string: JSON.stringify(body) },
  });
  return handler(() => as(userId))(req, ctx);
}

describe("/api/skills", () => {
  it("vide au départ", async () => {
    expect((await call("s1", "GET")).jsonBody).toEqual({ levels: {}, updatedAt: null });
  });

  it("enregistre ○ et ◎ puis les relit", async () => {
    await call("s2", "PUT", { levels: { python: 2, figma: 1 } });
    expect((await call("s2", "GET")).jsonBody).toMatchObject({ levels: { python: 2, figma: 1 } });
    // Tout est renvoyé à chaque fois : une compétence absente n'est plus cochée.
    await call("s2", "PUT", { levels: { python: 1 } });
    expect((await call("s2", "GET")).jsonBody).toMatchObject({ levels: { python: 1 } });
  });

  it("400 pour un niveau ou un identifiant invalide", async () => {
    expect((await call("s3", "PUT", { levels: { python: 3 } })).status).toBe(400);
    expect((await call("s3", "PUT", { levels: { "<script>": 1 } })).status).toBe(400);
    expect((await call("s3", "PUT", null)).status).toBe(400);
  });

  it("ne touche pas au profil rangé dans le même conteneur", async () => {
    await call("s4", "PUT", { levels: { swift: 2 } });
    expect((await call("s4", "GET", undefined, profileHandler)).status).toBe(404);
  });
});

describe("スキル辞典 dans les consignes de l'IA", () => {
  it("noms japonais lus dans la liste du site ; ◎ puis ○ ; identifiant inconnu ignoré", () => {
    expect(skillLines({ swift: 2, "cross-cultural": 2, python: 1, inconnu: 2 })).toEqual([
      "スキル ◎得意（自己評価）：Swift、異文化コミュニケーション",
      "スキル ○基礎あり（自己評価）：Python",
    ]);
    expect(skillLines({})).toEqual([]);
    expect(skillLines(null)).toEqual([]);
  });

  it("relecture d'ES : les compétences dans <skills>, rien sans compétence", () => {
    const draft = { question: "自己PRをしてください。", body: "私の強みは行動力です。", charLimit: 300, company: undefined, kind: "selfPr" as const };
    const user = buildMessages(draft, "fr", { skills: { swift: 2 } })[1].content;
    expect(user).toContain("<skills>\nスキル ◎得意（自己評価）：Swift\n</skills>");
    expect(buildMessages(draft, "fr", {})[1].content).not.toContain("<skills>");
  });

  it("entretien : les compétences dans le contexte, même sans profil", () => {
    const context = buildContext({ application: null, profile: null, drafts: [], stage: "interview1", skills: { figma: 2, sql: 1 } });
    expect(context).toContain("スキル ◎得意（自己評価）：Figma");
    expect(context).toContain("スキル ○基礎あり（自己評価）：SQL");
  });
});
