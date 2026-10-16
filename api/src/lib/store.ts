/**
 * Accès aux documents. Toutes les opérations exigent un userId (clé de partition) :
 * il n'existe aucune méthode capable de lire les données d'un autre utilisateur.
 */
import { CosmosClient, type Database } from "@azure/cosmos";
import type { ContainerName } from "./models";

export type Doc = { id: string; userId: string };

export interface DocStore {
  get<T extends Doc>(container: ContainerName, userId: string, id: string): Promise<T | null>;
  list<T extends Doc>(container: ContainerName, userId: string): Promise<T[]>;
  put<T extends Doc>(container: ContainerName, doc: T): Promise<T>;
  remove(container: ContainerName, userId: string, id: string): Promise<boolean>;
  ping(): Promise<void>;
}

// ------------------------------------------------------------------ mémoire (tests, dev local)

export class MemoryStore implements DocStore {
  private data = new Map<string, Doc>();

  private key(container: string, userId: string, id: string) {
    return `${container}/${userId}/${id}`;
  }

  async get<T extends Doc>(container: ContainerName, userId: string, id: string) {
    const doc = this.data.get(this.key(container, userId, id));
    return doc ? (structuredClone(doc) as T) : null;
  }

  async list<T extends Doc>(container: ContainerName, userId: string) {
    const prefix = `${container}/${userId}/`;
    return [...this.data.entries()]
      .filter(([k]) => k.startsWith(prefix))
      .map(([, v]) => structuredClone(v) as T);
  }

  async put<T extends Doc>(container: ContainerName, doc: T) {
    this.data.set(this.key(container, doc.userId, doc.id), structuredClone(doc));
    return doc;
  }

  async remove(container: ContainerName, userId: string, id: string) {
    return this.data.delete(this.key(container, userId, id));
  }

  async ping() {}
}

// ------------------------------------------------------------------ Cosmos DB

export class CosmosStore implements DocStore {
  constructor(private db: Database) {}

  static fromEnv(env = process.env) {
    const { COSMOS_ENDPOINT, COSMOS_KEY, COSMOS_DATABASE = "shukatsu" } = env;
    if (!COSMOS_ENDPOINT || !COSMOS_KEY) throw new Error("COSMOS_ENDPOINT et COSMOS_KEY sont requis");
    return new CosmosStore(new CosmosClient({ endpoint: COSMOS_ENDPOINT, key: COSMOS_KEY }).database(COSMOS_DATABASE));
  }

  async get<T extends Doc>(container: ContainerName, userId: string, id: string) {
    const { resource } = await this.db.container(container).item(id, userId).read<T>();
    return resource ?? null;
  }

  async list<T extends Doc>(container: ContainerName, userId: string) {
    const { resources } = await this.db
      .container(container)
      .items.query<T>({ query: "SELECT * FROM c WHERE c.userId = @u", parameters: [{ name: "@u", value: userId }] },
        { partitionKey: userId })
      .fetchAll();
    return resources.map(strip);
  }

  async put<T extends Doc>(container: ContainerName, doc: T) {
    const { resource } = await this.db.container(container).items.upsert<T>(doc);
    return strip(resource as T);
  }

  async remove(container: ContainerName, userId: string, id: string) {
    try {
      await this.db.container(container).item(id, userId).delete();
      return true;
    } catch (e) {
      if ((e as { code?: number }).code === 404) return false;
      throw e;
    }
  }

  async ping() {
    await this.db.read();
  }
}

/** Retire les champs système de Cosmos (_rid, _etag, _ts…) avant de renvoyer un document. */
function strip<T>(doc: T): T {
  return Object.fromEntries(Object.entries(doc as object).filter(([k]) => !k.startsWith("_"))) as T;
}

let shared: DocStore | null = null;

/** Store utilisé par les fonctions : Cosmos si configuré, sinon mémoire (développement local). */
export function getStore(): DocStore {
  shared ??= process.env.COSMOS_ENDPOINT ? CosmosStore.fromEnv() : new MemoryStore();
  return shared;
}
