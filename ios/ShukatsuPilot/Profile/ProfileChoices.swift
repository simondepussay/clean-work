import Foundation

/// Listes de choix du profil (codes identiques à l'API). Les champs restent des String :
/// une ancienne valeur hors liste s'affiche vide au lieu de faire échouer le décodage.
enum ProfileChoices {
    typealias Choice = (value: String, label: String)

    static let languages: [Choice] = [
        ("ja", "日本語 / Japanese"), ("en", "英語 / English"), ("zh", "中国語 / Chinese"), ("ko", "韓国語 / Korean"),
        ("vi", "ベトナム語 / Vietnamese"), ("ne", "ネパール語 / Nepali"), ("id", "インドネシア語 / Indonesian"),
        ("th", "タイ語 / Thai"), ("fr", "フランス語 / French"), ("es", "スペイン語 / Spanish"),
        ("de", "ドイツ語 / German"), ("pt", "ポルトガル語 / Portuguese"), ("other", "その他 / Other"),
    ]

    static let levels: [Choice] = [
        ("native", "ネイティブ / Native"), ("business", "ビジネス / Business"),
        ("conversational", "日常会話 / Conversational"), ("basic", "基礎 / Basic"),
    ]

    static let certificationCategories: [Choice] = [
        ("language", "語学 / Language"), ("it", "IT"), ("business", "ビジネス / Business"),
        ("degree", "学位・学校 / Degree"), ("driving", "運転免許 / Driving licence"), ("other", "その他 / Other"),
    ]

    /// Suggestions de noms selon la catégorie ; on peut toujours écrire autre chose.
    static let certificationSuggestions: [String: [String]] = [
        "language": ["日本語能力試験 N1", "日本語能力試験 N2", "日本語能力試験 N3", "日本語能力試験 N4", "日本語能力試験 N5",
                     "BJTビジネス日本語能力テスト", "TOEIC Listening & Reading", "TOEFL iBT", "IELTS", "実用英語技能検定（英検）", "DELF / DALF"],
        "it": ["基本情報技術者試験", "応用情報技術者試験", "ITパスポート試験", "情報セキュリティマネジメント試験",
               "Microsoft Azure Fundamentals (AZ-900)", "AWS Certified Cloud Practitioner", "Oracle Certified Java Programmer"],
        "business": ["日商簿記検定 3級", "日商簿記検定 2級", "秘書技能検定", "MOS（Microsoft Office Specialist）"],
        "degree": ["学士", "修士", "専門士"],
        "driving": ["普通自動車第一種運転免許", "国際運転免許証"],
    ]
}
