/**
 * Règles métier sur les profils et les candidatures. Valide les entrées avec zod,
 * attribue les identifiants et les dates, calcule la prochaine échéance.
 */
import { randomUUID } from "node:crypto";
import {
  applicationInputSchema,
  containers,
  draftInputSchema,
  type Draft,
  nextDeadline,
  profileInputSchema,
  type Application,
  type Review,
  type Profile,
} from "./models";
import type { DocStore } from "./store";

type Clock = () => Date;

export class Repository {
  constructor(private store: DocStore, private now: Clock = () => new Date()) {}

  private today() {
    return this.now().toISOString().slice(0, 10);
  }

  // -------------------------------------------------------------- profil (un seul par utilisateur)

  getProfile(userId: string) {
    return this.store.get<Profile>(containers.profiles, userId, userId);
  }

  async saveProfile(userId: string, input: unknown) {
    const data = profileInputSchema.parse(input);
    const profile: Profile = { ...data, id: userId, userId, updatedAt: this.now().toISOString() };
    return this.store.put(containers.profiles, profile);
  }

  // -------------------------------------------------------------- candidatures

  async listApplications(userId: string) {
    const apps = await this.store.list<Application>(containers.applications, userId);
    // Les échéances les plus proches d'abord, les candidatures sans échéance à la fin.
    return apps.sort((a, b) => (a.nextDeadline ?? "9999").localeCompare(b.nextDeadline ?? "9999")
      || a.company.localeCompare(b.company));
  }

  async createApplication(userId: string, input: unknown) {
    const data = applicationInputSchema.parse(input);
    const at = this.now().toISOString();
    const app: Application = {
      ...data,
      id: randomUUID(),
      userId,
      nextDeadline: nextDeadline(data.steps, this.today()),
      createdAt: at,
      updatedAt: at,
    };
    return this.store.put(containers.applications, app);
  }

  async updateApplication(userId: string, id: string, input: unknown) {
    const current = await this.store.get<Application>(containers.applications, userId, id);
    if (!current) return null;
    const { id: _id, userId: _u, nextDeadline: _n, createdAt, updatedAt: _t, ...editable } = current;
    const data = applicationInputSchema.parse({ ...editable, ...(input as object) });
    const app: Application = {
      ...data,
      id,
      userId,
      nextDeadline: nextDeadline(data.steps, this.today()),
      createdAt,
      updatedAt: this.now().toISOString(),
    };
    return this.store.put(containers.applications, app);
  }

  deleteApplication(userId: string, id: string) {
    return this.store.remove(containers.applications, userId, id);
  }

  // -------------------------------------------------------------- ES (S13)

  async listDrafts(userId: string) {
    const drafts = await this.store.list<Draft>(containers.drafts, userId);
    return drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getDraft(userId: string, id: string) {
    return this.store.get<Draft>(containers.drafts, userId, id);
  }

  async createDraft(userId: string, input: unknown) {
    const data = draftInputSchema.parse(input);
    const at = this.now().toISOString();
    return this.store.put<Draft>(containers.drafts, { ...data, id: randomUUID(), userId, createdAt: at, updatedAt: at });
  }

  async updateDraft(userId: string, id: string, input: unknown) {
    const current = await this.getDraft(userId, id);
    if (!current) return null;
    const { id: _id, userId: _u, createdAt, updatedAt: _t, ...editable } = current;
    const data = draftInputSchema.parse({ ...editable, ...(input as object) });
    return this.store.put<Draft>(containers.drafts, { ...data, id, userId, createdAt, updatedAt: this.now().toISOString() });
  }

  deleteDraft(userId: string, id: string) {
    return this.store.remove(containers.drafts, userId, id);
  }

  // -------------------------------------------------------------- relectures (S14, S15)

  saveReview(review: Review) {
    return this.store.put<Review>(containers.reviews, review);
  }

  /** Relectures d'une ES, la plus récente d'abord. */
  async listReviews(userId: string, draftId: string) {
    const all = await this.store.list<Review>(containers.reviews, userId);
    return all.filter((r) => r.draftId === draftId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // -------------------------------------------------------------- suppression du compte (S25)

  /**
   * Programme la suppression de toutes les données de l'utilisateur : invisibles tout de suite,
   * effacées par Cosmos DB après `retentionDays` jours. Renvoie le nombre de documents.
   */
  async scheduleDeletion(userId: string, retentionDays: number) {
    const mark = { deletedAt: this.now().toISOString(), ttl: retentionDays * 86400 };
    let count = 0;
    for (const container of Object.values(containers)) count += await this.store.markDeleted(container, userId, mark);
    return count;
  }

  /** Annule une suppression programmée (après restauration du compte dans l'annuaire). */
  async restoreAllData(userId: string) {
    let count = 0;
    for (const container of Object.values(containers)) count += await this.store.restore(container, userId);
    return count;
  }
}
