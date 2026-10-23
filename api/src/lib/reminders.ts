/**
 * Rappels des échéances envoyés par le serveur (S26).
 *
 * Une fois par jour, à 8 h (heure du Japon), chaque utilisateur qui a un iPhone enregistré
 * reçoit UNE notification qui résume ses échéances d'aujourd'hui et de demain : un résumé
 * plutôt qu'une notification par échéance, pour ne pas noyer l'utilisateur.
 *
 * L'envoi est « au plus une fois par jour » : avant d'envoyer, on pose une marque atomique
 * (compteur Cosmos, comme pour les limites de l'IA). Si la tâche est relancée le même jour
 * (nouvel essai de GitHub Actions…), personne ne reçoit le rappel deux fois.
 */
import { containers, type Application, type Device } from "./models";
import type { PushMessage, PushSender } from "./push";
import type { DocStore } from "./store";

const CLOSED = new Set(["rejected", "withdrawn"]);
const STEP_NAMES: Record<string, string> = {
  es: "ES", test: "適性検査", interview1: "一次面接", interview2: "二次面接", final: "最終面接", offer: "内定",
};
/** Nombre d'échéances écrites en toutes lettres ; les suivantes deviennent « ほか N件 ». */
const SHOWN = 3;
/** La marque « déjà envoyé » est gardée une semaine, puis Cosmos DB l'efface. */
const MARK_TTL = 7 * 86400;

/** Date du jour au Japon (AAAA-MM-JJ) : les échéances sont des dates locales japonaises. */
export function tokyoDate(now: Date, plusDays = 0): string {
  return new Date(now.getTime() + 9 * 3600_000 + plusDays * 86400_000).toISOString().slice(0, 10);
}

type Item = { company: string; step: string };

/** Échéances d'aujourd'hui et de demain : mêmes règles que le web et l'iOS (étapes non terminées, candidatures en cours). */
export function dueSoon(apps: Application[], today: string, tomorrow: string) {
  const pick = (date: string): Item[] =>
    apps
      .filter((a) => !CLOSED.has(a.status))
      .flatMap((a) => a.steps.filter((s) => !s.done && s.dueDate === date).map((s) => ({ company: a.company, step: s.type })))
      .sort((a, b) => a.company.localeCompare(b.company));
  return { today: pick(today), tomorrow: pick(tomorrow) };
}

/** Le texte de la notification, ou null s'il n'y a rien à rappeler. */
export function reminderMessage(due: { today: Item[]; tomorrow: Item[] }): PushMessage | null {
  const lines = [
    ...due.today.map((i) => `今日：${i.company} ${STEP_NAMES[i.step] ?? i.step}`),
    ...due.tomorrow.map((i) => `明日：${i.company} ${STEP_NAMES[i.step] ?? i.step}`),
  ];
  if (lines.length === 0) return null;
  const more = lines.length - SHOWN;
  const title = due.today.length > 0 ? "今日締切があります / Due today" : "明日締切があります / Due tomorrow";
  return { title, body: [...lines.slice(0, SHOWN), ...(more > 0 ? [`ほか${more}件 / ${more} more`] : [])].join("\n") };
}

export type RunSummary = { users: number; notified: number; skipped: number; sent: number; gone: number; failed: number };

export async function runReminders(store: DocStore, sender: PushSender, now = new Date()): Promise<RunSummary> {
  const today = tokyoDate(now);
  const tomorrow = tokyoDate(now, 1);
  const summary: RunSummary = { users: 0, notified: 0, skipped: 0, sent: 0, gone: 0, failed: 0 };

  for (const [userId, devices] of byUser(await store.scanDevices<Device>())) {
    summary.users++;
    const apps = await store.list<Application>(containers.applications, userId);
    const message = reminderMessage(dueSoon(apps, today, tomorrow));
    if (!message) continue;

    // Marque « envoyé aujourd'hui » posée AVANT l'envoi : deux exécutions simultanées ne peuvent pas envoyer toutes les deux.
    const markId = `push-${today}`;
    const { sent } = await store.increment(containers.usage, userId, markId, { sent: 1 }, MARK_TTL);
    if (sent > 1) {
      summary.skipped++;
      continue;
    }

    const results = await Promise.all(devices.map((d) => sender.send(d, message).catch(() => "failed" as const)));
    for (const [i, r] of results.entries()) {
      summary[r]++;
      if (r === "gone") await store.remove(containers.devices, userId, devices[i].id);
    }
    if (results.some((r) => r === "sent")) summary.notified++;
    // Rien n'est parti à cause d'une panne : on retire la marque pour qu'un nouvel essai puisse envoyer.
    else if (results.every((r) => r === "failed")) await store.increment(containers.usage, userId, markId, { sent: -1 });
  }
  return summary;
}

/**
 * Regroupe les appareils par utilisateur. Un même iPhone peut apparaître sous deux comptes
 * (déconnexion sans réseau, puis connexion à un autre compte) : on ne garde que le compte
 * le plus récent, pour ne jamais montrer les échéances de quelqu'un d'autre.
 */
function byUser(devices: Device[]) {
  const latest = new Map<string, Device>();
  for (const d of devices) {
    const seen = latest.get(d.token);
    if (!seen || d.updatedAt > seen.updatedAt) latest.set(d.token, d);
  }
  const groups = new Map<string, Device[]>();
  for (const d of latest.values()) groups.set(d.userId, [...(groups.get(d.userId) ?? []), d]);
  return groups;
}
