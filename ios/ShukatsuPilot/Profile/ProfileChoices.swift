import Foundation

/// Listes de choix du profil (codes identiques à l'API). Les champs restent des String :
/// une ancienne valeur hors liste s'affiche vide au lieu de faire échouer le décodage.
enum ProfileChoices {
    typealias Choice = (value: String, label: String)

    static var languages: [Choice] { [
        ("ja", tr("日本語", "Japanese", "Japonais")), ("en", tr("英語", "English", "Anglais")), ("zh", tr("中国語", "Chinese", "Chinois")), ("ko", tr("韓国語", "Korean", "Coréen")),
        ("vi", tr("ベトナム語", "Vietnamese", "Vietnamien")), ("ne", tr("ネパール語", "Nepali", "Népalais")), ("id", tr("インドネシア語", "Indonesian", "Indonésien")),
        ("th", tr("タイ語", "Thai", "Thaï")), ("fr", tr("フランス語", "French", "Français")), ("es", tr("スペイン語", "Spanish", "Espagnol")),
        ("de", tr("ドイツ語", "German", "Allemand")), ("pt", tr("ポルトガル語", "Portuguese", "Portugais")), ("other", tr("その他", "Other", "Autre")),
    ] }

    static var levels: [Choice] { [
        ("native", tr("ネイティブ", "Native", "Langue maternelle")), ("business", tr("ビジネス", "Business", "Professionnel")),
        ("conversational", tr("日常会話", "Conversational", "Courant")), ("basic", tr("基礎", "Basic", "Notions")),
    ] }

    static var certificationCategories: [Choice] { [
        ("language", tr("語学", "Language", "Langues")), ("it", "IT"), ("business", tr("ビジネス", "Business", "Professionnel")),
        ("degree", tr("学位・学校", "Degree", "Diplôme")), ("driving", tr("運転免許", "Driving licence", "Permis de conduire")), ("other", tr("その他", "Other", "Autre")),
    ] }

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
