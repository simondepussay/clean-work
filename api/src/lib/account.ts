import type { DirectoryUsers } from "./directory";
import type { Repository } from "./repository";

/**
 * Délai avant la suppression définitive, aligné sur la corbeille de l'annuaire
 * (Microsoft garde un utilisateur supprimé 30 jours). Pendant ce délai, l'administrateur
 * peut restaurer le compte et ses données (infra/restore-account.mjs).
 */
export const RETENTION_DAYS = 30;

export class DirectoryUnavailableError extends Error {}

/**
 * Supprime un compte (S25) : d'abord les données (masquées, effacées par Cosmos après
 * RETENTION_DAYS jours), puis le compte de l'annuaire (corbeille, même délai).
 *
 * Dans cet ordre, un échec à la 2e étape laisse un compte vide mais toujours
 * utilisable : l'utilisateur peut se reconnecter et recommencer. Dans l'ordre
 * inverse, il ne pourrait plus se connecter et ses données resteraient orphelines.
 */
export async function deleteAccount(userId: string, repo: Repository, directory: DirectoryUsers | null) {
  // Sans annuaire, on refuse avant de toucher aux données : un « compte supprimé »
  // qui existerait encore dans l'annuaire serait une promesse non tenue.
  if (!directory) throw new DirectoryUnavailableError("suppression dans l'annuaire non configurée");
  const documents = await repo.scheduleDeletion(userId, RETENTION_DAYS);
  await directory.deleteUser(userId);
  return { documents, retentionDays: RETENTION_DAYS };
}
