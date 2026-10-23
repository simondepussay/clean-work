import { HttpRequest, InvocationContext } from "@azure/functions";
import { describe, expect, it } from "vitest";
import { devicesHandler } from "../src/functions/devices";
import type { IdentityVerifier } from "../src/lib/identity";
import { containers, type Device } from "../src/lib/models";
import type { PushSender } from "../src/lib/push";
import { MemoryStore } from "../src/lib/store";

const as = (userId: string): IdentityVerifier => ({ verify: async (t) => (t === "ok" ? { userId } : null) });
const ctx = new InvocationContext({ logHandler: () => {} });
const TOKEN = "AB".repeat(32);

function api(store = new MemoryStore(), push: PushSender | null = { send: async () => "sent" }) {
  return (userId: string, method: string, token?: string, body?: unknown) =>
    devicesHandler({ verifier: () => as(userId), store: () => store, push: () => push, now: () => new Date("2026-10-23T03:00:00Z") })(
      new HttpRequest({
        url: `https://x/api/devices${token ? `/${token}` : ""}`, method, params: token ? { token } : {},
        headers: { "x-shukatsu-token": "ok" }, body: body === undefined ? undefined : { string: JSON.stringify(body) },
      }), ctx);
}

describe("/api/devices", () => {
  it("enregistre le jeton (en minuscules) et dit si le serveur enverra les rappels", async () => {
    const store = new MemoryStore();
    const res = await api(store)("u1", "POST", undefined, { token: TOKEN, environment: "sandbox" });
    expect(res.jsonBody).toEqual({ push: "on" });
    expect(await store.list<Device>(containers.devices, "u1")).toMatchObject([{ id: TOKEN.toLowerCase(), environment: "sandbox" }]);
  });

  it("le même jeton deux fois ne crée pas de doublon", async () => {
    const store = new MemoryStore();
    const call = api(store);
    await call("u1", "POST", undefined, { token: TOKEN, environment: "sandbox" });
    await call("u1", "POST", undefined, { token: TOKEN, environment: "production" });
    expect(await store.list<Device>(containers.devices, "u1")).toMatchObject([{ environment: "production" }]);
  });

  it("« off » quand APNs n'est pas configuré : l'app garde ses rappels locaux", async () => {
    expect((await api(new MemoryStore(), null)("u1", "POST", undefined, { token: TOKEN, environment: "sandbox" })).jsonBody).toEqual({ push: "off" });
  });

  it("400 si le jeton ou l'environnement est invalide", async () => {
    const call = api();
    expect((await call("u1", "POST", undefined, { token: "pas-hexa", environment: "sandbox" })).status).toBe(400);
    expect((await call("u1", "POST", undefined, { token: TOKEN, environment: "staging" })).status).toBe(400);
  });

  it("supprime à la déconnexion, sans toucher aux appareils des autres", async () => {
    const store = new MemoryStore();
    const call = api(store);
    await call("u1", "POST", undefined, { token: TOKEN, environment: "sandbox" });
    expect((await call("intrus", "DELETE", TOKEN)).status).toBe(204);
    expect(await store.list(containers.devices, "u1")).toHaveLength(1);
    expect((await call("u1", "DELETE", TOKEN)).status).toBe(204);
    expect(await store.list(containers.devices, "u1")).toHaveLength(0);
  });
});
