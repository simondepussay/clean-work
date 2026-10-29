/**
 * Notifications envoyées par le serveur (S26), une fois par jour à 8 h (heure du Japon).
 *
 * Trois sortes, chacune avec sa propre marque « déjà envoyé » (pas de limite globale par jour) :
 *  - échéances : UN résumé des échéances d'aujourd'hui et de demain, plutôt qu'une notification par échéance ;
 *  - JLPT : le jour où l'inscription ouvre, puis 3 jours avant la clôture, pour ceux dont le japonais
 *    n'est pas la langue maternelle (en 2026, des sessions ont fermé plus tôt que prévu : s'inscrire tôt compte) ;
 *  - relance : après 7 jours sans rien ajouter ni modifier dans 応募, au plus une fois par semaine ;
 *  - encouragement (onglet こころ, voir cheer.ts) : réconfort, félicitations, petite poussée ou mot du jour,
 *    au plus un par jour, au rythme choisi par l'utilisateur.
 *
 * Le rappel d'encouragement 1 h avant un entretien est programmé par l'iPhone lui-même (notification locale) :
 * il demande la précision de la minute, et le serveur ne tourne qu'une fois par jour.
 *
 * Avant d'envoyer, on pose une marque atomique (compteur Cosmos, comme pour les limites de l'IA) :
 * si la tâche est relancée (nouvel essai de GitHub Actions…), personne ne reçoit deux fois la même chose.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cheersFor, pickForPush, readWords, type Word } from "./cheer";
import type { KokoroDoc } from "./kokoro";
import { containers, type Application, type Device, type Draft, type Profile } from "./models";
import type { Interview } from "./interview";
import type { PushMessage, PushSender } from "./push";
import type { DocStore } from "./store";

type Lang = "ja" | "en" | "fr";
type Text3 = { ja: string; en: string; fr: string };

/** Dans la langue de l'iPhone ; sans langue connue (ancienne version de l'app), japonais et anglais. */
const say = (lang: Lang | undefined, t: Text3) => (lang ? t[lang] : `${t.ja} / ${t.en}`);

const CLOSED = new Set(["rejected", "withdrawn"]);
const STEP_NAMES: Record<string, Text3> = {
  es: { ja: "ES", en: "Entry sheet", fr: "ES" },
  applied: { ja: "応募済み", en: "Applied", fr: "Postulé" },
  test: { ja: "適性検査", en: "Aptitude test", fr: "Test d'aptitude" },
  interview1: { ja: "一次面接", en: "1st interview", fr: "1er entretien" },
  interview2: { ja: "二次面接", en: "2nd interview", fr: "2e entretien" },
  final: { ja: "最終面接", en: "Final interview", fr: "Entretien final" },
  offer: { ja: "内定", en: "Offer", fr: "Offre" },
  followup: { ja: "フォローアップ", en: "Follow-up", fr: "Relance" },
};
const stepName = (step: string, lang: Lang | undefined) => STEP_NAMES[step]?.[lang ?? "ja"] ?? step;

/** Nombre d'échéances écrites en toutes lettres ; les suivantes deviennent « ほか N件 ». */
const SHOWN = 3;
/** Jours sans activité dans 応募 avant une relance. */
export const IDLE_DAYS = 7;
const DAY = 86400;

/** Date du jour au Japon (AAAA-MM-JJ) : les échéances sont des dates locales japonaises. */
export function tokyoDate(now: Date, plusDays = 0): string {
  return new Date(now.getTime() + 9 * 3600_000 + plusDays * 86400_000).toISOString().slice(0, 10);
}

const daysBetween = (from: string, to: string) => Math.floor((Date.parse(to) - Date.parse(from)) / 86400_000);

// ------------------------------------------------------------------ échéances

type Item = { company: string; step: string; note?: string };

/**
 * Échéances d'aujourd'hui et de demain : mêmes règles que le web et l'iOS (étapes non terminées, candidatures en cours),
 * et les relances à faire (フォローアップ) avec leur note.
 */
export function dueSoon(apps: Application[], today: string, tomorrow: string) {
  const pick = (date: string): Item[] =>
    apps
      .filter((a) => !CLOSED.has(a.status))
      .flatMap((a) => [
        ...a.steps.filter((s) => !s.done && s.dueDate === date).map((s) => ({ company: a.company, step: s.type })),
        ...(a.followUps ?? []).filter((f) => !f.done && f.date === date).map((f) => ({ company: a.company, step: "followup", note: f.note })),
      ])
      .sort((a, b) => a.company.localeCompare(b.company));
  return { today: pick(today), tomorrow: pick(tomorrow) };
}

/** Le résumé des échéances, ou null s'il n'y a rien à rappeler. */
export function reminderMessage(due: { today: Item[]; tomorrow: Item[] }, lang?: Lang): PushMessage | null {
  const today = lang ? { ja: "今日", en: "Today", fr: "Aujourd'hui" }[lang] : "今日";
  const tomorrow = lang ? { ja: "明日", en: "Tomorrow", fr: "Demain" }[lang] : "明日";
  const sep = lang && lang !== "ja" ? " : " : "：";
  // Une relance s'affiche avec ce qu'il faut faire : « 楽天 フォローアップ（お礼メール） ».
  const label = (i: Item) => (i.note ? `${stepName(i.step, lang)}（${i.note}）` : stepName(i.step, lang));
  const lines = [
    ...due.today.map((i) => `${today}${sep}${i.company} ${label(i)}`),
    ...due.tomorrow.map((i) => `${tomorrow}${sep}${i.company} ${label(i)}`),
  ];
  if (lines.length === 0) return null;
  const more = lines.length - SHOWN;
  const title = due.today.length > 0
    ? say(lang, { ja: "今日締切があります", en: "Due today", fr: "Échéance aujourd'hui" })
    : say(lang, { ja: "明日締切があります", en: "Due tomorrow", fr: "Échéance demain" });
  const rest = more > 0 ? [say(lang, { ja: `ほか${more}件`, en: `${more} more`, fr: `${more} de plus` })] : [];
  return { title, body: [...lines.slice(0, SHOWN), ...rest].join("\n") };
}

// ------------------------------------------------------------------ JLPT

export type JlptSession = { exam: string; open: string; close: string };
export type JlptSchedule = { url: string; sessions: JlptSession[] };

/** Le calendrier des inscriptions (api/content/jlpt.json), à compléter quand JEES publie les dates. */
export function readJlptSchedule(path = join(__dirname, "../../../content/jlpt.json")): JlptSchedule {
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    return { url: data.url, sessions: Array.isArray(data.sessions) ? data.sessions : [] };
  } catch {
    return { url: "https://info.jees-jlpt.jp/", sessions: [] };
  }
}

/**
 * Japonais non natif : du japonais à un autre niveau que « natif », ou une autre langue maternelle.
 * Sans profil ou sans langue renseignée, on ne sait pas : pas de rappel (un Japonais ne doit pas en recevoir).
 */
export function needsJlpt(profile: Profile | null) {
  const langs = profile?.languages ?? [];
  if (langs.some((l) => l.language === "ja" && l.level === "native")) return false;
  return langs.some((l) => l.language === "ja" || l.level === "native");
}

const examDay = (d: string, lang: Lang | undefined) => {
  const [y, m, day] = d.split("-").map(Number);
  return lang === "fr" ? `${day}/${m}/${y}` : lang === "en" ? d : `${m}月${day}日`;
};

/** Rappel JLPT du jour (ouverture, ou 3 jours avant la clôture), ou null. */
export function jlptMessage(schedule: JlptSchedule, today: string, lang?: Lang): { id: string; message: PushMessage } | null {
  for (const s of schedule.sessions) {
    const exam = examDay(s.exam, lang);
    if (today === s.open) {
      return { id: `jlpt-${s.exam}-open`, message: {
        title: say(lang, { ja: "JLPTの申込みが始まりました", en: "JLPT registration is open", fr: "Inscriptions au JLPT ouvertes" }),
        body: say(lang, {
          ja: `${exam}の試験の受付が今日から始まりました。早めに締め切られることもあるので、今のうちに申し込みましょう。`,
          en: `Registration for the ${exam} exam opens today. Sessions can fill up early, so sign up soon.`,
          fr: `Les inscriptions pour l'examen du ${exam} ouvrent aujourd'hui. Les places partent parfois vite : inscrivez-vous tôt.`,
        }),
      } };
    }
    if (daysBetween(today, s.close) === 3) {
      return { id: `jlpt-${s.exam}-close`, message: {
        title: say(lang, { ja: "JLPTの申込み締切まであと3日", en: "JLPT registration closes in 3 days", fr: "JLPT : clôture des inscriptions dans 3 jours" }),
        body: say(lang, {
          ja: `${exam}の試験、まだ申し込んでいなければ今がチャンスです。`,
          en: `If you haven't registered for the ${exam} exam yet, now is the time.`,
          fr: `Pas encore inscrit à l'examen du ${exam} ? C'est le moment.`,
        }),
      } };
    }
  }
  return null;
}

// ------------------------------------------------------------------ relance

/** Dernière activité dans 応募 : la candidature créée ou modifiée le plus récemment (null s'il n'y en a pas). */
export function lastActivity(apps: Application[]): string | null {
  const dates = apps.flatMap((a) => [a.updatedAt, a.createdAt]).filter((d) => d && !Number.isNaN(Date.parse(d))).sort();
  return dates.at(-1) ?? null;
}

/**
 * Relance après IDLE_DAYS jours sans activité. Sans candidature, on compte depuis l'arrivée de l'iPhone.
 * Pas de relance pour qui a déjà un 内定, ni quand toutes les candidatures sont terminées : on ne pousse pas.
 */
export function idleMessage(apps: Application[], since: string, now: Date, lang?: Lang): PushMessage | null {
  if (apps.some((a) => a.status === "offer")) return null;
  if (apps.length > 0 && apps.every((a) => CLOSED.has(a.status))) return null;
  const last = lastActivity(apps) ?? since;
  if (daysBetween(last, now.toISOString()) < IDLE_DAYS) return null;
  return apps.length === 0
    ? {
        title: say(lang, { ja: "最初の一社を追加してみませんか", en: "Add your first company?", fr: "Et si vous ajoutiez une première entreprise ?" }),
        body: say(lang, {
          ja: "気になる企業を一社書くだけで、就活の地図ができはじめます。",
          en: "Just one company you like, and your job-hunting map starts to take shape.",
          fr: "Une seule entreprise qui vous plaît, et votre carte du 就活 commence à se dessiner.",
        }),
      }
    : {
        title: say(lang, { ja: "最近どうですか？", en: "How is it going?", fr: "Comment ça avance ?" }),
        body: say(lang, {
          ja: "応募の状況を少し更新しておくと、次にやることがはっきり見えます。",
          en: "A quick update of your applications makes your next step clear.",
          fr: "Une petite mise à jour de vos candidatures, et la prochaine étape devient claire.",
        }),
      };
}

// ------------------------------------------------------------------ envoi

export type RunSummary = { users: number; notified: number; skipped: number; sent: number; gone: number; failed: number };

type Outgoing = { markId: string; ttl: number; message: PushMessage };

/** `cheers: false` : sans les encouragements (tests qui ne portent que sur les rappels). */
export async function runReminders(store: DocStore, sender: PushSender, now = new Date(), jlpt = readJlptSchedule(), words: Word[] = readWords(), cheers = true): Promise<RunSummary> {
  const today = tokyoDate(now);
  const tomorrow = tokyoDate(now, 1);
  const summary: RunSummary = { users: 0, notified: 0, skipped: 0, sent: 0, gone: 0, failed: 0 };

  for (const [userId, devices] of byUser(await store.scanDevices<Device>())) {
    summary.users++;
    const lang = devices.find((d) => d.language)?.language;
    const apps = await store.list<Application>(containers.applications, userId);
    const outgoing: Outgoing[] = [];

    const deadlines = reminderMessage(dueSoon(apps, today, tomorrow), lang);
    if (deadlines) outgoing.push({ markId: `push-${today}`, ttl: 7 * DAY, message: deadlines });

    const jlptReminder = jlptMessage(jlpt, today, lang);
    if (jlptReminder && needsJlpt(await store.get<Profile>(containers.profiles, userId, userId))) {
      outgoing.push({ markId: `push-${jlptReminder.id}`, ttl: 60 * DAY, message: jlptReminder.message });
    }

    const since = devices.map((d) => d.createdAt).sort()[0] ?? now.toISOString();
    const idle = idleMessage(apps, since, now, lang);
    // Une seule marque, qui expire après une semaine : au plus une relance par semaine.
    if (idle) outgoing.push({ markId: "push-idle", ttl: IDLE_DAYS * DAY - 3600, message: idle });

    // Encouragement du jour (même calcul que la page « こころ »).
    if (cheers) await addCheer();
    async function addCheer() {
    const [kokoro, drafts, interviews] = await Promise.all([
      store.get<KokoroDoc>(containers.profiles, userId, "kokoro"),
      store.list<Draft>(containers.drafts, userId),
      store.list<Interview>(containers.interviews, userId),
    ]);
    const cheer = pickForPush(cheersFor({
      userId, apps, drafts, interviews, moods: kokoro?.moods ?? [], values: kokoro?.values ?? [], today, now, words,
    }), kokoro?.cheerFrequency ?? "daily", today);
    if (cheer) outgoing.push({ markId: `push-cheer-${today}`, ttl: 2 * DAY, message: { title: say(lang, cheer.title), body: say(lang, cheer.body) } });
    }

    let notified = false;
    for (const o of outgoing) {
      // Marque posée AVANT l'envoi : deux exécutions simultanées ne peuvent pas envoyer toutes les deux.
      const { sent } = await store.increment(containers.usage, userId, o.markId, { sent: 1 }, o.ttl);
      if (sent > 1) {
        summary.skipped++;
        continue;
      }
      const results = await Promise.all(devices.map((d) => sender.send(d, o.message).catch(() => "failed" as const)));
      for (const [i, r] of results.entries()) {
        summary[r]++;
        if (r === "gone") await store.remove(containers.devices, userId, devices[i].id);
      }
      if (results.some((r) => r === "sent")) notified = true;
      // Rien n'est parti à cause d'une panne : on retire la marque pour qu'un nouvel essai puisse envoyer.
      else if (results.every((r) => r === "failed")) await store.increment(containers.usage, userId, o.markId, { sent: -1 });
    }
    if (notified) summary.notified++;
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
