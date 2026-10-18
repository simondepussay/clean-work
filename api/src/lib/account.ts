import type { DirectoryUsers } from "./directory";
import type { Repository } from "./repository";

export class DirectoryUnavailableError extends Error {}

/**
 * Supprime un compte (S25) : d'abord les données, puis le compte de l'annuaire.
 *
 * Dans cet ordre, un échec à la 2e étape laisse un compte vide mais toujours
 * utilisable : l'utilisateur peut se reconnecter et recommencer. Dans l'ordre
 * inverse, il ne pourrait plus se connecter et ses données resteraient orphelines.
 */
export async function deleteAccount(userId: string, repo: Repository, directory: DirectoryUsers | null) {
  // Sans annuaire, on refuse avant de toucher aux données : un « compte supprimé »
  // qui existerait encore dans l'annuaire serait une promesse non tenue.
  if (!directory) throw new DirectoryUnavailableError("suppression dans l'annuaire non configurée");
  const documents = await repo.deleteAllData(userId);
  await directory.deleteUser(userId);
  return { documents };
}
