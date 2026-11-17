import { HttpRequest, InvocationContext } from "@azure/functions";
import { describe, expect, it } from "vitest";
import { agentKeysHandler } from "../src/functions/agentKeys";
import { mcpHandler } from "../src/functions/mcp";
import { notesHandler } from "../src/functions/notes";
import { scoreHandler } from "../src/functions/score";
import { RateLimiter } from "../src/lib/http";
import type { IdentityVerifier } from "../src/lib/identity";
import { MemoryStore } from "../src/lib/store";
import { Repository } from "../src/lib/repository";

const as = (userId: string): IdentityVerifier => ({ verify: async (t) => (t === "ok" ? { userId } : null) });
const ctx = new InvocationContext({ logHandler: () => {} });
const now = () => new Date("2026-11-17T03:00:00Z");
const req = (method: string, url: string, body?: unknown, headers: Record<string, string> = {}, params: Record<string, string> = {}) => new HttpRequest({
  url: `https://x${url}`, method, params, headers: { "x-shukatsu-token": "ok", ...headers },
  body: body === undefined ? undefined : { string: JSON.stringify(body) },
});

function setup() {
  const store = new MemoryStore();
  const keys = agentKeysHandler({ verifier: () => as("u1"), store: () => store, now });
  const mcp = mcpHandler({ store: () => store, now, limiter: new RateLimiter(1000) });
  const newKey = async (scope: "read" | "write") => ((await keys(req("POST", "/api/agent-keys", { name: "Claude", scope }), ctx)).jsonBody as { key: string; info: { id: string } });
  let n = 0;
  const rpc = async (key: string, method: string, params?: unknown) => {
    const res = await mcp(new HttpRequest({ url: "https://x/api/mcp", method: "POST", headers: { authorization: `Bearer ${key}` }, body: { string: JSON.stringify({ jsonrpc: "2.0", id: ++n, method, params }) } }), ctx);
    return res;
  };
  const call = async (key: string, name: string, args: unknown = {}) =>
    ((await rpc(key, "tools/call", { name, arguments: args })).jsonBody as { result: { content: { text: string }[]; isError?: boolean } }).result;
  return { store, keys, mcp, newKey, rpc, call };
}

describe("clés pour agent", () => {
  it("montre la clé une seule fois, ne garde que son empreinte, et la révoque", async () => {
    const { store, keys, newKey, rpc } = setup();
    const { key, info } = await newKey("write");
    expect(key).toMatch(/^cwk_/);
    const list = (await keys(req("GET", "/api/agent-keys"), ctx)).jsonBody as object[];
    expect(list).toEqual([{ id: info.id, name: "Claude", scope: "write", createdAt: now().toISOString() }]);
    expect(JSON.stringify(store.all("profiles", "u1"))).not.toContain(key);

    expect((await rpc(key, "ping")).status ?? 200).toBe(200);
    expect((await keys(req("DELETE", `/api/agent-keys/${info.id}`, undefined, {}, { id: info.id }), ctx)).status).toBe(204);
    expect((await rpc(key, "ping")).status).toBe(401);
  });

  it("refuse une clé inconnue, et coupe les clés d'un compte supprimé", async () => {
    const { store, newKey, rpc } = setup();
    expect((await rpc("cwk_nope", "ping")).status).toBe(401);
    const { key } = await newKey("read");
    await new Repository(store, now).scheduleDeletion("u1", 30);
    expect((await rpc(key, "ping")).status).toBe(401);
  });
});

describe("/api/mcp", () => {
  it("initialise, et une clé en lecture ne voit pas les outils d'écriture", async () => {
    const { newKey, rpc, call } = setup();
    const { key } = await newKey("read");
    const init = (await rpc(key, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } })).jsonBody as { result: { protocolVersion: string; serverInfo: { name: string } } };
    expect(init.result).toMatchObject({ protocolVersion: "2025-06-18", serverInfo: { name: "clean-work" } });
    const tools = ((await rpc(key, "tools/list")).jsonBody as { result: { tools: { name: string }[] } }).result.tools.map((t) => t.name);
    expect(tools).toEqual(["list_applications", "upcoming", "read_notes"]);
    expect((await call(key, "add_application", { company: "株式会社ミライ" })).isError).toBe(true);
  });

  it("un agent ajoute une candidature, la fait avancer, et la retrouve dans les échéances — sans points", async () => {
    const { store, newKey, call } = setup();
    const { key } = await newKey("write");
    const added = JSON.parse((await call(key, "add_application", { company: "株式会社ミライ", status: "applied", steps: [{ type: "es", dueDate: "2026-11-20" }] })).content[0].text);
    expect(added).toMatchObject({ company: "株式会社ミライ", status: "applied", nextDeadline: "2026-11-20" });

    const moved = JSON.parse((await call(key, "update_application", { id: added.id, status: "interview1", markDone: "es", addStep: { type: "interview1", dueDate: "2026-11-25", time: "14:00" } })).content[0].text);
    expect(moved).toMatchObject({ status: "interview1", nextDeadline: "2026-11-25" });

    await call(key, "add_calendar_item", { kind: "event", title: "合同説明会", date: "2026-11-19" });
    const upcoming = JSON.parse((await call(key, "upcoming", { days: 10 })).content[0].text) as { date: string; what: string }[];
    expect(upcoming.map((u) => u.date)).toEqual(["2026-11-19", "2026-11-25"]);

    const score = await scoreHandler({ verifier: () => as("u1"), store: () => store })(req("GET", "/api/score"), ctx);
    expect((score.jsonBody as { points: number }).points).toBe(0);
  });

  it("explique une entrée refusée, et ne touche pas à la candidature d'un id inconnu", async () => {
    const { newKey, call } = setup();
    const { key } = await newKey("write");
    expect((await call(key, "add_calendar_item", { title: "x", date: "demain" })).content[0].text).toMatch(/Invalid input — date/);
    expect((await call(key, "update_application", { id: "nope", status: "offer" })).isError).toBe(true);
  });

  it("ajoute au bloc-notes de l'accueil sans effacer ce qui y est", async () => {
    const { store, newKey, call } = setup();
    const notes = notesHandler({ verifier: () => as("u1"), store: () => store, now });
    await notes(req("PUT", "/api/notes", { text: "OB訪問のお礼を書く" }), ctx);
    const { key } = await newKey("write");
    await call(key, "add_note", { text: "ミライの説明会の資料を読む" });
    expect(((await notes(req("GET", "/api/notes"), ctx)).jsonBody as { text: string }).text).toBe("OB訪問のお礼を書く\nミライの説明会の資料を読む");
  });

  it("répond 202 à une notification, et accepte la clé dans l'adresse", async () => {
    const { mcp, newKey } = setup();
    const { key } = await newKey("read");
    const res = await mcp(new HttpRequest({ url: `https://x/api/mcp/${key}`, method: "POST", params: { key }, body: { string: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) } }), ctx);
    expect(res.status).toBe(202);
  });
});
