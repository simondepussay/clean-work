/** Liens de l'onglet « 情報 » : partenaires, sites d'offres, ressources utiles (tous publics et gratuits). */
import type { T3 } from "../i18n";

export type InfoLink = { name: string; url: string; text: T3 };

/** Les projets partenaires (ceux de Simon). */
export const PARTNERS: InfoLink[] = [
  {
    name: "JLPT Étude",
    url: "https://jlpt.simondepussay.com",
    text: { ja: "JLPT N1 の語彙・漢字・文法を勉強するサイト", en: "Study JLPT N1 vocabulary, kanji and grammar", fr: "Réviser le vocabulaire, les kanji et la grammaire du JLPT N1" },
  },
  {
    name: "JLPT Kanji Otter Adventure",
    url: "https://apps.apple.com/us/app/jlpt-kanji-otter-adventure/id6497395953",
    text: { ja: "ゲームで漢字を覚える iPhone アプリ", en: "An iPhone game for learning kanji", fr: "Un jeu iPhone pour apprendre les kanji" },
  },
];

/** Les grands sites d'offres (on n'y envoie pas de robot : leurs conditions l'interdisent). */
export const JOB_SITES: InfoLink[] = [
  { name: "ハローワーク", url: "https://www.hellowork.mhlw.go.jp/", text: { ja: "国の求人検索", en: "Japan's public job search", fr: "Recherche d'emploi publique" } },
  { name: "リクナビ", url: "https://job.rikunabi.com/", text: { ja: "新卒向けの大手就職サイト", en: "Major site for new graduates", fr: "Grand site pour jeunes diplômés" } },
  { name: "マイナビ", url: "https://job.mynavi.jp/", text: { ja: "新卒向けの大手就職サイト", en: "Major site for new graduates", fr: "Grand site pour jeunes diplômés" } },
  { name: "TokyoDev", url: "https://www.tokyodev.com/", text: { ja: "外国人エンジニア向け（英語）", en: "Developer jobs for foreigners (English)", fr: "Postes de développeur pour étrangers (anglais)" } },
  { name: "Japan Dev", url: "https://japan-dev.com/", text: { ja: "英語で働けるIT企業", en: "English-friendly tech companies", fr: "Entreprises tech anglophones" } },
  { name: "GaijinPot Jobs", url: "https://jobs.gaijinpot.com/", text: { ja: "外国人向けの求人", en: "Jobs for foreigners in Japan", fr: "Offres pour étrangers au Japon" } },
  { name: "LAPRAS", url: "https://lapras.com/?lang=ja", text: { ja: "エンジニア向けのスカウト型転職サービス", en: "Scouting platform for engineers", fr: "Recrutement par approche directe pour ingénieurs" } },
  { name: "Daijob", url: "https://www.daijob.com/", text: { ja: "バイリンガル向けの求人", en: "Bilingual jobs", fr: "Postes bilingues" } },
];

/** Informations officielles et ouvertes, utiles aux étudiants étrangers. */
export const RESOURCES: InfoLink[] = [
  { name: "出入国在留管理庁", url: "https://www.moj.go.jp/isa/", text: { ja: "就労ビザ・在留資格の変更", en: "Work visas and status changes", fr: "Visas de travail et changement de statut" } },
  { name: "厚生労働省 外国人雇用", url: "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/koyou/gaikokujin/index.html", text: { ja: "外国人の雇用と労働のルール", en: "Rules on employing foreign workers", fr: "Règles d'emploi des étrangers" } },
  { name: "JETRO 高度外国人材", url: "https://www.jetro.go.jp/hrportal/", text: { ja: "日本で働く外国人材の情報", en: "Information for international talent", fr: "Informations pour les talents étrangers" } },
  { name: "JLPT 日本語能力試験", url: "https://www.jlpt.jp/", text: { ja: "試験日程と申し込み", en: "Test dates and registration", fr: "Dates et inscription" } },
  { name: "外国人雇用サービスセンター", url: "https://jsite.mhlw.go.jp/tokyo-foreigner/", text: { ja: "留学生の就職を無料で支援", en: "Free job support for international students", fr: "Aide gratuite à l'emploi des étudiants étrangers" } },
];
