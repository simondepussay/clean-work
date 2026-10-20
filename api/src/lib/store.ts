/**
 * Accès aux documents. Toutes les opérations exigent un userId (clé de partition) :
 * il n'existe aucune méthode capable de lire les données d'un autre utilisateur.
 *
 * Suppression du compte (S25) : les documents ne sont pas effacés tout de suite mais
 * marqués (`deletedAt`) avec une durée de vie (`ttl`, en secondes). Les lectures les
 * ignorent, et Cosmos DB les efface lui-même à l'échéance. D'ici là, `restore` les
 * rend à nouveau visibles.
 */
import { CosmosClient, type Database } from "@azure/cosmos";
import type { ContainerName } from "./models";

export type Doc = { id: string; userId: string };

/** Champs posés sur un document en attente de suppression définitive. */
export type DeletionMark = { deletedAt: string; ttl: number };

const isDeleted = (doc: object) => "deletedAt" in doc;

export interface DocStore {
  get<T extends Doc>(container: ContainerName, userId: string, id: string): Promise<T | null>;
  list<T extends Doc>(container: ContainerName, userId: string): Promise<T[]>;
  put<T extends Doc>(container: ContainerName, doc: T): Promise<T>;
  remove(container: ContainerName, userId: string, id: string): Promise<boolean>;
  /** Marque tous les documents de l'utilisateur comme supprimés ; renvoie leur nombre. */
  markDeleted(container: ContainerName, userId: string, mark: DeletionMark): Promise<number>;
  /** Annule la suppression des documents de l'utilisateur ; renvoie leur nombre. */
  restore(container: ContainerName, userId: string): Promise<number>;
  /**
   * Ajoute (ou retire) des quantités à des champs numériques, de façon atomique, et renvoie
   * les nouvelles valeurs. Le document est créé s'il n'existe pas, avec la durée de vie `ttl`.
   */
  increment(container: ContainerName, userId: string, id: string, deltas: Record<string, number>, ttl?: number): Promise<Record<string, number>>;
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
    return doc && !isDeleted(doc) ? (structuredClone(doc) as T) : null;
  }

  async list<T extends Doc>(container: ContainerName, userId: string) {
    return this.all(container, userId).filter((d) => !isDeleted(d)) as T[];
  }

  /** Tous les documents de l'utilisateur, supprimés compris (pour les tests et la restauration). */
  all(container: ContainerName, userId: string): Doc[] {
    const prefix = `${container}/${userId}/`;
    return [...this.data.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => structuredClone(v));
  }

  async put<T extends Doc>(container: ContainerName, doc: T) {
    this.data.set(this.key(container, doc.userId, doc.id), structuredClone(doc));
    return doc;
  }

  async remove(container: ContainerName, userId: string, id: string) {
    return this.data.delete(this.key(container, userId, id));
  }

  async markDeleted(container: ContainerName, userId: string, mark: DeletionMark) {
    const docs = await this.list(container, userId);
    for (const d of docs) await this.put(container, { ...d, ...mark });
    return docs.length;
  }

  async restore(container: ContainerName, userId: string) {
    const docs = this.all(container, userId).filter(isDeleted);
    for (const d of docs) await this.put(container, withoutMark(d));
    return docs.length;
  }

  async increment(container: ContainerName, userId: string, id: string, deltas: Record<string, number>, ttl?: number) {
    const key = this.key(container, userId, id);
    const doc = (this.data.get(key) ?? { id, userId, ...(ttl ? { ttl } : {}) }) as Doc & Record<string, number>;
    const result: Record<string, number> = {};
    for (const [field, delta] of Object.entries(deltas)) result[field] = doc[field] = (doc[field] ?? 0) + delta;
    this.data.set(key, doc);
    return result;
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
    return resource && !isDeleted(resource) ? strip(resource) : null;
  }

  async list<T extends Doc>(container: ContainerName, userId: string) {
    return this.query<T>(container, userId, "NOT IS_DEFINED(c.deletedAt)");
  }

  private async query<T>(container: ContainerName, userId: string, condition: string) {
    const { resources } = await this.db
      .container(container)
      .items.query<T>({ query: `SELECT * FROM c WHERE c.userId = @u AND ${condition}`, parameters: [{ name: "@u", value: userId }] },
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

  async markDeleted(container: ContainerName, userId: string, mark: DeletionMark) {
    const docs = await this.list<Doc>(container, userId);
    for (const d of docs) await this.put(container, { ...d, ...mark });
    return docs.length;
  }

  async restore(container: ContainerName, userId: string) {
    const docs = await this.query<Doc>(container, userId, "IS_DEFINED(c.deletedAt)");
    // Sans `ttl`, le document reprend la durée de vie du conteneur (-1 : jamais effacé).
    for (const d of docs) await this.put(container, withoutMark(d));
    return docs.length;
  }

  async increment(container: ContainerName, userId: string, id: string, deltas: Record<string, number>, ttl?: number) {
    const item = this.db.container(container).item(id, userId);
    const operations = Object.entries(deltas).map(([field, value]) => ({ op: "incr" as const, path: `/${field}`, value }));
    const read = (doc: Record<string, unknown>) => Object.fromEntries(Object.keys(deltas).map((f) => [f, Number(doc[f] ?? 0)]));
    try {
      const { resource } = await item.patch(operations);
      return read(resource);
    } catch (e) {
      if ((e as { code?: number }).code !== 404) throw e;
    }
    // Premier compteur du mois : on crée le document. Si une autre requête l'a créé entre-temps (409), on réessaie le patch.
    try {
      const { resource } = await this.db.container(container).items.create({ id, userId, ...(ttl ? { ttl } : {}), ...deltas });
      return read(resource as unknown as Record<string, unknown>);
    } catch (e) {
      if ((e as { code?: number }).code !== 409) throw e;
      const { resource } = await item.patch(operations);
      return read(resource);
    }
  }

  async ping() {
    await this.db.read();
  }
}

function withoutMark<T extends Doc>(doc: T): T {
  const { deletedAt: _d, ttl: _t, ...rest } = doc as T & Partial<DeletionMark>;
  return rest as T;
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
