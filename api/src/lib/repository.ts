/**
 * Règles métier sur les profils et les candidatures. Valide les entrées avec zod,
 * attribue les identifiants et les dates, calcule la prochaine échéance.
 */
import { randomUUID } from "node:crypto";
import {
  applicationInputSchema,
  containers,
  nextDeadline,
  profileInputSchema,
  type Application,
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

  // -------------------------------------------------------------- suppression du compte (S25)

  /** Efface toutes les données de l'utilisateur, conteneur par conteneur ; renvoie le nombre de documents. */
  async deleteAllData(userId: string) {
    let count = 0;
    for (const container of Object.values(containers)) count += await this.store.removeAll(container, userId);
    return count;
  }
}
