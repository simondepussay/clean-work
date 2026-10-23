import { describe, expect, it, vi } from "vitest";
import { createPlan, listApplications } from "./api";

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("cache des lectures de l'API", () => {
  it("deux lectures de suite (même onglet ou deux onglets) : une seule requête", async () => {
    const f = vi.fn(async () => ok([{ id: "a1" }]));
    const [a, b] = await Promise.all([listApplications("t", f), listApplications("t", f)]);
    await listApplications("t", f);
    expect(f).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });

  it("chaque lecture reçoit sa copie : trier une liste ne change pas celle des autres", async () => {
    const f = vi.fn(async () => ok([{ id: "b" }, { id: "a" }]));
    const first = await listApplications("t", f);
    if (first.ok) first.value.reverse();
    const second = await listApplications("t", f);
    expect(second.ok && second.value.map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("une modification vide le cache : la lecture suivante redemande", async () => {
    const f = vi.fn(async (url: string | URL | Request) => ok(String(url) === "/api/plans" ? { id: "p" } : []));
    await listApplications("t", f);
    await createPlan("t", { kind: "note", title: "x", date: "2026-10-23" }, f);
    await listApplications("t", f);
    expect(f.mock.calls.filter(([u]) => u === "/api/applications")).toHaveLength(2);
  });

  it("un autre compte ne lit pas le cache ; une erreur n'est pas gardée", async () => {
    const f = vi.fn(async () => ok([]));
    await listApplications("alice", f);
    await listApplications("bob", f);
    expect(f).toHaveBeenCalledTimes(2);
    const failing = vi.fn(async () => new Response("", { status: 500 }));
    await expect(listApplications("carol", failing)).rejects.toThrow();
    await expect(listApplications("carol", failing)).rejects.toThrow();
    expect(failing).toHaveBeenCalledTimes(2);
  });
});
