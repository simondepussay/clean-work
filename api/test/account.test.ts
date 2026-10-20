import { describe, expect, it, vi } from "vitest";
import { deleteAccount, DirectoryUnavailableError, RETENTION_DAYS } from "../src/lib/account";
import { GraphDirectoryUsers, directoryFromEnv, type DirectoryUsers } from "../src/lib/directory";
import { Repository } from "../src/lib/repository";
import { MemoryStore } from "../src/lib/store";

async function seeded() {
  const store = new MemoryStore();
  lastStore = store;
  const repo = new Repository(store, () => new Date("2026-10-18T00:00:00Z"));
  await repo.saveProfile("u1", { nameKanji: "シモン", nameKana: "シモン" });
  await repo.createApplication("u1", { company: "A" });
  await repo.createApplication("u1", { company: "B" });
  await repo.saveProfile("u2", { nameKanji: "他人", nameKana: "タニン" });
  await repo.createApplication("u2", { company: "C" });
  return repo;
}

let lastStore: MemoryStore;

const fakeDirectory = (): DirectoryUsers & { deleted: string[] } => {
  const deleted: string[] = [];
  return { deleted, deleteUser: async (id) => void deleted.push(id) };
};

describe("deleteAccount", () => {
  it("masque toutes les données de l'utilisateur puis supprime son compte d'annuaire", async () => {
    const repo = await seeded();
    const directory = fakeDirectory();

    expect(await deleteAccount("u1", repo, directory)).toEqual({ documents: 3, retentionDays: 30 });

    expect(await repo.getProfile("u1")).toBeNull();
    expect(await repo.listApplications("u1")).toEqual([]);
    expect(directory.deleted).toEqual(["u1"]);
  });

  it("programme l'effacement par Cosmos DB après 30 jours (ttl en secondes)", async () => {
    const repo = await seeded();
    await deleteAccount("u1", repo, fakeDirectory());
    const marked = [...lastStore.all("profiles", "u1"), ...lastStore.all("applications", "u1")];
    expect(marked).toHaveLength(3);
    for (const doc of marked) {
      expect(doc).toMatchObject({ deletedAt: "2026-10-18T00:00:00.000Z", ttl: RETENTION_DAYS * 86400 });
    }
    expect(RETENTION_DAYS * 86400).toBe(2_592_000);
  });

  it("la restauration rend toutes les données, sans marque de suppression", async () => {
    const repo = await seeded();
    await deleteAccount("u1", repo, fakeDirectory());

    expect(await repo.restoreAllData("u1")).toBe(3);

    expect(await repo.getProfile("u1")).toMatchObject({ nameKanji: "シモン" });
    expect((await repo.listApplications("u1")).map((a) => a.company)).toEqual(["A", "B"]);
    for (const doc of lastStore.all("applications", "u1")) {
      expect(doc).not.toHaveProperty("deletedAt");
      expect(doc).not.toHaveProperty("ttl");
    }
  });

  it("une restauration sans suppression ne change rien", async () => {
    const repo = await seeded();
    expect(await repo.restoreAllData("u1")).toBe(0);
    expect(await repo.listApplications("u1")).toHaveLength(2);
  });

  it("ne touche pas aux données des autres utilisateurs", async () => {
    const repo = await seeded();
    await deleteAccount("u1", repo, fakeDirectory());
    expect(await repo.getProfile("u2")).not.toBeNull();
    expect(await repo.listApplications("u2")).toHaveLength(1);
  });

  it("refuse sans annuaire configuré, avant d'effacer quoi que ce soit", async () => {
    const repo = await seeded();
    await expect(deleteAccount("u1", repo, null)).rejects.toBeInstanceOf(DirectoryUnavailableError);
    expect(await repo.getProfile("u1")).not.toBeNull();
  });

  it("si l'annuaire échoue, les données sont déjà masquées et on peut recommencer", async () => {
    const repo = await seeded();
    const failing: DirectoryUsers = { deleteUser: async () => { throw new Error("Graph 500"); } };
    await expect(deleteAccount("u1", repo, failing)).rejects.toThrow("Graph 500");
    expect(await repo.getProfile("u1")).toBeNull();

    const directory = fakeDirectory();
    expect(await deleteAccount("u1", repo, directory)).toEqual({ documents: 0, retentionDays: 30 });
    expect(directory.deleted).toEqual(["u1"]);
  });
});

describe("GraphDirectoryUsers", () => {
  const ok = (body: unknown = {}, status = 200) => new Response(JSON.stringify(body), { status });

  it("obtient un jeton d'application puis supprime l'utilisateur", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(ok({ access_token: "app-token", expires_in: 3600 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    await new GraphDirectoryUsers("tenant", "client", "secret", fetcher).deleteUser("oid/1");

    expect(fetcher.mock.calls[0][0]).toBe("https://login.microsoftonline.com/tenant/oauth2/v2.0/token");
    expect(fetcher.mock.calls[1][0]).toBe("https://graph.microsoft.com/v1.0/users/oid%2F1");
    expect(fetcher.mock.calls[1][1]).toMatchObject({ method: "DELETE", headers: { Authorization: "Bearer app-token" } });
  });

  it("garde le jeton en mémoire entre deux suppressions", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(ok({ access_token: "t", expires_in: 3600 }))
      .mockResolvedValue(new Response(null, { status: 204 }));
    const graph = new GraphDirectoryUsers("tenant", "client", "secret", fetcher);
    await graph.deleteUser("a");
    await graph.deleteUser("b");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("accepte un utilisateur déjà supprimé (404)", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(ok({ access_token: "t", expires_in: 3600 }))
      .mockResolvedValueOnce(new Response("not found", { status: 404 }));
    await expect(new GraphDirectoryUsers("t", "c", "s", fetcher).deleteUser("x")).resolves.toBeUndefined();
  });

  it("échoue si Graph refuse", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(ok({ access_token: "t", expires_in: 3600 }))
      .mockResolvedValueOnce(new Response("forbidden", { status: 403 }));
    await expect(new GraphDirectoryUsers("t", "c", "s", fetcher).deleteUser("x")).rejects.toThrow("403");
  });

  it("n'est configuré qu'avec les trois réglages", () => {
    expect(directoryFromEnv({ ENTRA_TENANT_ID: "t", ENTRA_GRAPH_CLIENT_ID: "c" })).toBeNull();
    expect(directoryFromEnv({ ENTRA_TENANT_ID: "t", ENTRA_GRAPH_CLIENT_ID: "c", ENTRA_GRAPH_SECRET: "s" })).toBeInstanceOf(GraphDirectoryUsers);
  });
});
