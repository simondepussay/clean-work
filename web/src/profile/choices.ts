/** Listes de choix du profil, avec leurs libellés dans les trois langues (codes identiques à l'API). */
import type { Lang, T3 } from "../i18n";

type Choice = { value: string; label: T3 };

/** Les options d'une liste, libellées dans la langue choisie. */
export const options = (list: Choice[], lang: Lang) => list.map((c) => ({ value: c.value, label: c.label[lang] }));

export const languages: Choice[] = [
  { value: "ja", label: { ja: "日本語", en: "Japanese", fr: "Japonais" } },
  { value: "en", label: { ja: "英語", en: "English", fr: "Anglais" } },
  { value: "zh", label: { ja: "中国語", en: "Chinese", fr: "Chinois" } },
  { value: "ko", label: { ja: "韓国語", en: "Korean", fr: "Coréen" } },
  { value: "vi", label: { ja: "ベトナム語", en: "Vietnamese", fr: "Vietnamien" } },
  { value: "ne", label: { ja: "ネパール語", en: "Nepali", fr: "Népalais" } },
  { value: "id", label: { ja: "インドネシア語", en: "Indonesian", fr: "Indonésien" } },
  { value: "th", label: { ja: "タイ語", en: "Thai", fr: "Thaï" } },
  { value: "fr", label: { ja: "フランス語", en: "French", fr: "Français" } },
  { value: "es", label: { ja: "スペイン語", en: "Spanish", fr: "Espagnol" } },
  { value: "de", label: { ja: "ドイツ語", en: "German", fr: "Allemand" } },
  { value: "pt", label: { ja: "ポルトガル語", en: "Portuguese", fr: "Portugais" } },
  { value: "other", label: { ja: "その他", en: "Other", fr: "Autre" } },
];

export const levels: Choice[] = [
  { value: "native", label: { ja: "ネイティブ", en: "Native", fr: "Langue maternelle" } },
  { value: "business", label: { ja: "ビジネス", en: "Business", fr: "Professionnel" } },
  { value: "conversational", label: { ja: "日常会話", en: "Conversational", fr: "Conversation courante" } },
  { value: "basic", label: { ja: "基礎", en: "Basic", fr: "Notions" } },
];

export const certificationCategories: Choice[] = [
  { value: "language", label: { ja: "語学", en: "Language", fr: "Langues" } },
  { value: "it", label: { ja: "IT", en: "IT", fr: "Informatique" } },
  { value: "business", label: { ja: "ビジネス", en: "Business", fr: "Gestion" } },
  { value: "degree", label: { ja: "学位・学校", en: "Degree", fr: "Diplôme" } },
  { value: "driving", label: { ja: "運転免許", en: "Driving licence", fr: "Permis de conduire" } },
  { value: "other", label: { ja: "その他", en: "Other", fr: "Autre" } },
];

/** Suggestions de noms selon la catégorie ; on peut toujours écrire autre chose. */
export const certificationSuggestions: Record<string, string[]> = {
  language: ["日本語能力試験 N1", "日本語能力試験 N2", "日本語能力試験 N3", "日本語能力試験 N4", "日本語能力試験 N5",
    "BJTビジネス日本語能力テスト", "TOEIC Listening & Reading", "TOEFL iBT", "IELTS", "実用英語技能検定（英検）", "DELF / DALF"],
  it: ["基本情報技術者試験", "応用情報技術者試験", "ITパスポート試験", "情報セキュリティマネジメント試験",
    "Microsoft Azure Fundamentals (AZ-900)", "AWS Certified Cloud Practitioner", "Oracle Certified Java Programmer"],
  business: ["日商簿記検定 3級", "日商簿記検定 2級", "秘書技能検定", "MOS（Microsoft Office Specialist）"],
  degree: ["学士", "修士", "専門士"],
  driving: ["普通自動車第一種運転免許", "国際運転免許証"],
  other: [],
};
