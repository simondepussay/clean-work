/**
 * Clés pour agent IA : l'utilisateur relie son agent (Claude, ChatGPT…) à Clean Work par le serveur MCP
 * (/api/mcp). Chaque clé a un nom, une portée (« read » : lire ; « write » : lire et ajouter / modifier)
 * et se révoque d'un geste.
 *
 * Sécurité :
 *   - la clé n'est montrée qu'une fois, à la création ; on ne garde que son empreinte SHA-256 ;
 *   - pour retrouver le compte à partir de la clé, un document de correspondance (partition « _agent-keys »
 *     du conteneur des compteurs) ; il ne vaut que si la clé figure encore dans la liste du compte
 *     (document « agent-keys » des profils) : révoquer la clé ou supprimer le compte suffit à la couper ;
 *   - un agent n'atteint jamais こころ ni le journal, et ne supprime rien (voir lib/mcp.ts).
 */
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { containers, messages } from "./models";
import type { DocStore } from "./store";

export const KEY_PREFIX = "cwk_";
export const MAX_KEYS = 5;
const LOOKUP = "_agent-keys";
const LIST_DOC = "agent-keys";

export const agentScopes = ["read", "write"] as const;
export type AgentScope = (typeof agentScopes)[number];

export const agentKeyInputSchema = z.object({
  name: z.string().trim().min(1, messages.required).max(40, messages.tooLong(40)),
  scope: z.enum(agentScopes).default("write"),
});

export type AgentKey = { id: string; name: string; scope: AgentScope; createdAt: string; lastUsedAt?: string };
/** Dans le document, chaque clé garde aussi son empreinte (pour effacer la correspondance à la révocation). */
type StoredKey = AgentKey & { hash: string };
type KeysDoc = { id: typeof LIST_DOC; userId: string; keys: StoredKey[] };
type LookupDoc = { id: string; userId: typeof LOOKUP; owner: string; keyId: string };

export type AgentIdentity = { userId: string; keyId: string; scope: AgentScope; name: string };

const fingerprint = (secret: string) => createHash("sha256").update(secret).digest("hex");

export class TooManyKeysError extends Error {}

export class AgentKeyService {
  constructor(private store: DocStore, private now: () => Date = () => new Date()) {}

  private async stored(userId: string): Promise<StoredKey[]> {
    return (await this.store.get<KeysDoc>(containers.profiles, userId, LIST_DOC))?.keys ?? [];
  }

  /** Les clés du compte, sans leur empreinte. */
  async list(userId: string): Promise<AgentKey[]> {
    return (await this.stored(userId)).map(({ hash: _h, ...k }) => k);
  }

  /** Crée une clé ; le secret n'est renvoyé qu'ici. */
  async create(userId: string, input: unknown): Promise<{ key: string; info: AgentKey }> {
    const { name, scope } = agentKeyInputSchema.parse(input);
    const keys = await this.stored(userId);
    if (keys.length >= MAX_KEYS) throw new TooManyKeysError();
    const secret = KEY_PREFIX + randomBytes(32).toString("base64url");
    const hash = fingerprint(secret);
    const info: AgentKey = { id: hash.slice(0, 12), name, scope, createdAt: this.now().toISOString() };
    await this.store.put<LookupDoc>(containers.usage, { id: `key-${hash}`, userId: LOOKUP, owner: userId, keyId: info.id });
    await this.store.put<KeysDoc>(containers.profiles, { id: LIST_DOC, userId, keys: [...keys, { ...info, hash }] });
    return { key: secret, info };
  }

  async revoke(userId: string, keyId: string): Promise<boolean> {
    const keys = await this.stored(userId);
    const key = keys.find((k) => k.id === keyId);
    if (!key) return false;
    await this.store.put<KeysDoc>(containers.profiles, { id: LIST_DOC, userId, keys: keys.filter((k) => k.id !== keyId) });
    await this.store.remove(containers.usage, LOOKUP, `key-${key.hash}`);
    return true;
  }

  /** Le compte et la portée d'une clé, ou null si elle est inconnue, révoquée, ou le compte supprimé. */
  async verify(secret: string | null | undefined): Promise<AgentIdentity | null> {
    if (!secret || !secret.startsWith(KEY_PREFIX) || secret.length > 100) return null;
    const lookup = await this.store.get<LookupDoc>(containers.usage, LOOKUP, `key-${fingerprint(secret)}`);
    if (!lookup) return null;
    const keys = await this.stored(lookup.owner);
    const key = keys.find((k) => k.id === lookup.keyId);
    if (!key) return null;
    // « Dernière utilisation », à l'heure près : pas une écriture par requête.
    const now = this.now();
    if (!key.lastUsedAt || now.getTime() - Date.parse(key.lastUsedAt) > 3600_000) {
      const updated = keys.map((k) => (k.id === key.id ? { ...k, lastUsedAt: now.toISOString() } : k));
      await this.store.put<KeysDoc>(containers.profiles, { id: LIST_DOC, userId: lookup.owner, keys: updated }).catch(() => undefined);
    }
    return { userId: lookup.owner, keyId: key.id, scope: key.scope, name: key.name };
  }
}
