import { HttpRequest, InvocationContext } from "@azure/functions";
import { describe, expect, it } from "vitest";
import { profileHandler } from "../src/functions/profile";
import { skillsHandler } from "../src/functions/skills";
import type { IdentityVerifier } from "../src/lib/identity";

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
