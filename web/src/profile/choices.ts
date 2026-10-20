/** Listes de choix du profil, avec leurs libellés (codes identiques à l'API). */

export const languages = [
  { value: "ja", label: "日本語 / Japanese" },
  { value: "en", label: "英語 / English" },
  { value: "zh", label: "中国語 / Chinese" },
  { value: "ko", label: "韓国語 / Korean" },
  { value: "vi", label: "ベトナム語 / Vietnamese" },
  { value: "ne", label: "ネパール語 / Nepali" },
  { value: "id", label: "インドネシア語 / Indonesian" },
  { value: "th", label: "タイ語 / Thai" },
  { value: "fr", label: "フランス語 / French" },
  { value: "es", label: "スペイン語 / Spanish" },
  { value: "de", label: "ドイツ語 / German" },
  { value: "pt", label: "ポルトガル語 / Portuguese" },
  { value: "other", label: "その他 / Other" },
];

export const levels = [
  { value: "native", label: "ネイティブ / Native" },
  { value: "business", label: "ビジネス / Business" },
  { value: "conversational", label: "日常会話 / Conversational" },
  { value: "basic", label: "基礎 / Basic" },
];

export const certificationCategories = [
  { value: "language", label: "語学 / Language" },
  { value: "it", label: "IT" },
  { value: "business", label: "ビジネス / Business" },
  { value: "degree", label: "学位・学校 / Degree" },
  { value: "driving", label: "運転免許 / Driving licence" },
  { value: "other", label: "その他 / Other" },
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
