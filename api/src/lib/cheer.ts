/**
 * Encouragements (onglet « こころ » et notification du matin) : l'app remarque ce que l'utilisateur
 * fait ailleurs (応募, 書類, 面接) pour le féliciter, le pousser doucement, ou simplement lui parler.
 *
 * Sans état à tenir : tout se déduit des dates (dernières 24 h pour les ES, entraînements et
 * candidatures ; étapes cochées dont la date est aujourd'hui ou hier ; 内定 mis à jour depuis 48 h).
 *
 * Ordre de priorité (la notification prend le premier ; la page en montre plusieurs) :
 *   care      — un refus depuis hier : d'abord du réconfort ;
 *   offer     — un 内定 : la grande nouvelle ;
 *   done      — ce qui a été fait depuis hier, en une phrase ;
 *   streak    — 3, 7, 14, 30 jours de météo notée d'affilée ;
 *   nudge     — un entretien dans 1 à 3 jours sans entraînement, une ES due sans brouillon, des valeurs à écrire ;
 *   word      — le mot du jour (content/cheers.json), doux après un jour de pluie, sans répétition d'un jour à l'autre.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Application, Draft } from "./models";
import type { Interview } from "./interview";
import type { Mood } from "./kokoro";

export type Text3 = { ja: string; en: string; fr: string };
export type CheerKind = "care" | "offer" | "done" | "streak" | "nudge" | "word";
/** Onglet vers lequel la carte (ou la notification) renvoie. */
export type CheerAction = { tab: "interview" | "documents" | "apps" | "kokoro"; applicationId?: string };
export type Cheer = { id: string; kind: CheerKind; title: Text3; body: Text3; action?: CheerAction };
export type Word = { id: string; tag: "gentle" | "tip" | "energy"; ja: string; en: string; fr: string };

/** Fréquence choisie dans « こころ » ; les nouvelles importantes (refus, 内定) passent sauf « off ». */
export const cheerFrequencies = ["daily", "every2", "weekly", "off"] as const;
export type CheerFrequency = (typeof cheerFrequencies)[number];

const DAY_MS = 86_400_000;
const INTERVIEWS = new Set(["interview1", "interview2", "final"]);
const CLOSED = new Set(["rejected", "withdrawn"]);
const STAGE: Record<string, Text3> = {
  es: { ja: "ES", en: "entry sheet", fr: "ES" },
  interview1: { ja: "一次面接", en: "first interview", fr: "premier entretien" },
  interview2: { ja: "二次面接", en: "second interview", fr: "deuxième entretien" },
  final: { ja: "最終面接", en: "final interview", fr: "entretien final" },
};

/** La banque de mots (api/content/cheers.json) : depuis dist/src/lib une fois compilé, depuis src/lib dans les tests. */
export function readWords(paths = [join(__dirname, "../../../content/cheers.json"), join(__dirname, "../../content/cheers.json")]): Word[] {
  for (const path of paths) {
    try {
      const data = JSON.parse(readFileSync(path, "utf8"));
      if (Array.isArray(data.generic)) return data.generic;
    } catch {
      // Fichier absent à cet endroit : on essaie le suivant.
    }
  }
  return [];
}

const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const dayNumber = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
/** Petit hachage stable : chaque utilisateur parcourt les mots dans un ordre décalé. */
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Le mot du jour : un mot différent chaque jour, tous avant de recommencer ; doux après un jour de pluie. */
export function wordOfTheDay(words: Word[], userId: string, today: string, rainy: boolean): Word | null {
  const pool = rainy ? words.filter((w) => w.tag === "gentle") : words;
  if (pool.length === 0) return null;
  return pool[(dayNumber(today) + hash(userId)) % pool.length];
}

/** Jours d'affilée avec une météo notée, en finissant aujourd'hui (ou hier, si aujourd'hui n'est pas encore noté). */
export function moodStreak(moods: Mood[], today: string) {
  const days = new Set(moods.map((m) => m.date));
  let day = days.has(today) ? today : shift(today, -1);
  let n = 0;
  while (days.has(day)) { n++; day = shift(day, -1); }
  return n;
}

export type CheerInput = {
  userId: string;
  apps: Application[];
  drafts: Draft[];
  interviews: Interview[];
  moods: Mood[];
  values: string[];
  /** Date du jour au Japon (AAAA-MM-JJ) et instant présent. */
  today: string;
  now: Date;
  words: Word[];
};

export function cheersFor(input: CheerInput): Cheer[] {
  const { apps, drafts, interviews, moods, today, now } = input;
  const since = (iso?: string, hours = 24) => !!iso && now.getTime() - Date.parse(iso) <= hours * 3_600_000;
  const out: Cheer[] = [];

  // Réconfort après un refus.
  const rejected = apps.filter((a) => a.status === "rejected" && since(a.updatedAt));
  if (rejected.length > 0) {
    out.push({
      id: `care-${today}`, kind: "care",
      title: { ja: "おつかれさまでした", en: "You did your best", fr: "Vous avez fait de votre mieux" },
      body: {
        ja: `${rejected[0].company}の結果は残念でしたね。でも、あなたの価値は変わりません。今日は少し休んで大丈夫です。`,
        en: `The result from ${rejected[0].company} wasn't what you hoped. Your worth hasn't changed. It's okay to rest a little today.`,
        fr: `Le résultat de ${rejected[0].company} n'est pas celui espéré. Votre valeur, elle, n'a pas changé. Vous pouvez souffler un peu aujourd'hui.`,
      },
      action: { tab: "kokoro" },
    });
  }

  // 内定 !
  const offer = apps.find((a) => a.status === "offer" && since(a.updatedAt, 48));
  if (offer) {
    out.push({
      id: `offer-${offer.id}`, kind: "offer",
      title: { ja: "内定おめでとうございます！", en: "Congratulations on your offer!", fr: "Félicitations pour votre offre !" },
      body: {
        ja: `${offer.company}から内定。ここまで積み重ねてきたあなたの力です。今日は思いきり喜んでください。`,
        en: `An offer from ${offer.company}. This is what all your effort built. Celebrate today!`,
        fr: `Une offre de ${offer.company}. C'est le fruit de tous vos efforts. Profitez-en aujourd'hui !`,
      },
      action: { tab: "apps" },
    });
  }

  // Ce qui a été fait depuis hier, en une phrase.
  const yesterday = shift(today, -1);
  const done = {
    applied: apps.filter((a) => since(a.createdAt)).length,
    drafts: drafts.filter((d) => since(d.updatedAt) && d.body.trim().length > 0).length,
    practice: interviews.filter((i) => since(i.createdAt)).length,
    steps: apps.flatMap((a) => a.steps).filter((s) => s.done && s.dueDate && s.dueDate >= yesterday && s.dueDate <= today).length,
  };
  const parts: Text3[] = [
    done.steps && { ja: `選考を${done.steps}つ進めた`, en: `${done.steps} selection step(s) cleared`, fr: `${done.steps} étape(s) franchie(s)` },
    done.applied && { ja: `${done.applied}社を追加`, en: `${done.applied} company(ies) added`, fr: `${done.applied} entreprise(s) ajoutée(s)` },
    done.drafts && { ja: `ESを${done.drafts}本`, en: `${done.drafts} entry sheet(s) written`, fr: `${done.drafts} ES rédigée(s)` },
    done.practice && { ja: `面接練習を${done.practice}回`, en: `${done.practice} practice interview(s)`, fr: `${done.practice} entretien(s) d'entraînement` },
  ].filter(Boolean) as Text3[];
  if (parts.length > 0) {
    const join = (lang: keyof Text3, sep: string) => parts.map((p) => p[lang]).join(sep);
    out.push({
      id: `done-${today}`, kind: "done",
      title: { ja: "昨日もよくがんばりました", en: "Nice work yesterday", fr: "Belle journée hier" },
      body: {
        ja: `${join("ja", "、")}。ちゃんと前に進んでいます。`,
        en: `${join("en", ", ")}. You're really moving forward.`,
        fr: `${join("fr", ", ")}. Vous avancez vraiment.`,
      },
    });
  }

  // Régularité dans « こころ ».
  const streak = moodStreak(moods, today);
  if ([3, 7, 14, 30].includes(streak)) {
    out.push({
      id: `streak-${streak}-${today}`, kind: "streak",
      title: { ja: `${streak}日続けて記録しました`, en: `${streak} days in a row`, fr: `${streak} jours d'affilée` },
      body: {
        ja: "毎日の自分の気持ちに目を向けられているのは、とても大切なことです。",
        en: "Checking in with your feelings every day really matters.",
        fr: "Prendre des nouvelles de vous chaque jour, c'est précieux.",
      },
      action: { tab: "kokoro" },
    });
  }

  // Petites poussées vers les autres onglets.
  const open = apps.filter((a) => !CLOSED.has(a.status));
  const practicedRecently = new Set(interviews.filter((i) => since(i.createdAt, 24 * 14)).map((i) => i.applicationId).filter(Boolean));
  for (const a of open) {
    const step = a.steps.find((s) => INTERVIEWS.has(s.type) && !s.done && s.dueDate && s.dueDate > today && s.dueDate <= shift(today, 3));
    if (step && !practicedRecently.has(a.id)) {
      const n = Math.round((Date.parse(`${step.dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
      const stage = STAGE[step.type];
      out.push({
        id: `nudge-practice-${step.id}`, kind: "nudge",
        title: { ja: "面接の練習をしてみませんか", en: "A little interview practice?", fr: "Un peu d'entraînement ?" },
        body: {
          ja: `${a.company}の${stage.ja}まであと${n}日。10分だけでも、話す感覚がつかめます。`,
          en: `${n} day(s) until your ${stage.en} at ${a.company}. Even ten minutes helps you find your words.`,
          fr: `${n} jour(s) avant votre ${stage.fr} chez ${a.company}. Dix minutes suffisent pour trouver vos mots.`,
        },
        action: { tab: "interview", applicationId: a.id },
      });
      break;
    }
  }
  const drafted = new Set(drafts.filter((d) => d.body.trim().length > 0).map((d) => d.applicationId).filter(Boolean));
  for (const a of open) {
    const step = a.steps.find((s) => s.type === "es" && !s.done && s.dueDate && s.dueDate >= today && s.dueDate <= shift(today, 3));
    if (step && !drafted.has(a.id)) {
      out.push({
        id: `nudge-es-${step.id}`, kind: "nudge",
        title: { ja: "ESを書き始めませんか", en: "Start your entry sheet?", fr: "Commencer votre ES ?" },
        body: {
          ja: `${a.company}のESの締切が近づいています。最初の一文だけでも、今日書いてみましょう。`,
          en: `The entry sheet for ${a.company} is due soon. Write just the first sentence today.`,
          fr: `L'ES pour ${a.company} arrive bientôt à échéance. Écrivez juste la première phrase aujourd'hui.`,
        },
        action: { tab: "documents", applicationId: a.id },
      });
      break;
    }
  }
  const interviewThisWeek = open.some((a) => a.steps.some((s) => INTERVIEWS.has(s.type) && !s.done && s.dueDate && s.dueDate >= today && s.dueDate <= shift(today, 7)));
  // Avant un entretien : quelques lignes dans le journal (écrire ce qu'on ressent aide à le poser).
  if (interviewThisWeek) {
    out.push({
      id: `nudge-journal-${today}`, kind: "nudge",
      title: { ja: "面接の前に、日記を少しだけ", en: "A few lines in your journal", fr: "Quelques lignes dans ton journal" },
      body: {
        ja: "今の気持ちを書き出すと、頭が少し軽くなります。こころタブの日記はあなただけのものです。",
        en: "Writing down how you feel lightens your mind. The journal in the Mind tab is yours only.",
        fr: "Écrire ce que l'on ressent allège l'esprit. Le journal de l'onglet こころ n'appartient qu'à toi.",
      },
      action: { tab: "kokoro" },
    });
  }


  // Le mot du jour.
  const last = [...moods].filter((m) => m.date <= today).sort((a, b) => b.date.localeCompare(a.date))[0];
  const rainy = last?.weather === "rainy" && last.date >= yesterday;
  const word = wordOfTheDay(input.words, input.userId, today, rainy);
  if (word) {
    out.push({
      id: `word-${word.id}`, kind: "word",
      title: { ja: "今日のひとこと", en: "Today's word", fr: "Le mot du jour" },
      body: { ja: word.ja, en: word.en, fr: word.fr },
    });
  }
  return out;
}

/**
 * Faut-il envoyer un encouragement aujourd'hui, selon la fréquence choisie ?
 * Réconfort et 内定 passent toujours (sauf « off ») ; le reste suit le rythme choisi.
 */
export function pickForPush(cheers: Cheer[], frequency: CheerFrequency, today: string): Cheer | null {
  if (frequency === "off" || cheers.length === 0) return null;
  const first = cheers[0];
  if (first.kind === "care" || first.kind === "offer") return first;
  const n = dayNumber(today);
  if (frequency === "every2" && n % 2 !== 0) return null;
  // Une fois par semaine : le lundi (1970-01-01 était un jeudi).
  if (frequency === "weekly" && (n + 3) % 7 !== 0) return null;
  return first;
}
